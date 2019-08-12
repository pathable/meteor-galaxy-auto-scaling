import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import slackNotify from 'slack-notify';

import { scrapeInfo } from './scrape-info';
import { login } from './login';
import {
  getFormattedTimestamp,
  getMillisecondsNumber,
  getPercentualNumber,
} from './utilities';
import { autoscale } from './autoscale';

const getSlack = options => {
  if (options.silentSlack) {
    return {
      alert(...args) {
        console.log('silent slack - alert: ', ...args);
      },
      note(...args) {
        console.log('silent slack - note', ...args);
      },
    };
  }
  if (options.slackWebhook) {
    return slackNotify(options.slackWebhook);
  }

  return {
    alert(...args) {
      console.log('no slack - alert: ', ...args);
    },
    note(...args) {
      console.log('no slack - note', ...args);
    },
  };
};

const SUPPORTED_CONTAINER_METRICS = {
  cpu: { parse: getPercentualNumber, format: value => `${value}%` },
  memory: {
    parse: getPercentualNumber,
    format: value => `${value}%`,
  },
  clients: { parse: value => value, format: value => value },
};

const SUPPORTED_KADIRA_METRICS = {
  pubSubResponseTime: {
    parse: getMillisecondsNumber,
    format: value => `${value}ms`,
  },
  methodResponseTime: {
    parse: getMillisecondsNumber,
    format: value => `${value}ms`,
  },
};

const alertKadiraMetricAboveMax = ({
  metricName,
  maxValue,
  data,
  slack,
  appLink,
  lastMetricsText,
  lastContainerText,
}) => {
  if (maxValue == null) {
    return;
  }

  const metricsWithTimestamp = data.stats
    .filter(s => s.metrics[metricName])
    .map(s => ({
      value: SUPPORTED_KADIRA_METRICS[metricName].parse(
        s.metrics[metricName],
      ),
      timestamp: s.timestamp,
    }));

  if (
    metricsWithTimestamp.length && metricsWithTimestamp.map(c => c.value).every(v => v > maxValue)
  ) {
    slack.alert({
      text: `${appLink}: application compromised\n*${metricName}*: Latest ${
        metricsWithTimestamp.length
      } metrics are above ${SUPPORTED_KADIRA_METRICS[
        metricName
      ].format(maxValue)}\n${metricsWithTimestamp
        .map(
          valueWithTimestamp =>
            `${getFormattedTimestamp(
              valueWithTimestamp.timestamp,
            )}: ${SUPPORTED_KADIRA_METRICS[metricName].format(
              valueWithTimestamp.value,
            )}`,
        )
        .join(
          '\n',
        )}\n*Metrics*\n${lastMetricsText}\n*Containers*\n${lastContainerText}`,
    });
  }
};

const alertContainerMetricAboveMax = ({
  metricName,
  maxValue,
  data,
  slack,
  appLink,
  lastMetricsText,
  lastContainerText,
}) => {
  if (maxValue == null) {
    return;
  }
  const metricsByContainer = data.stats
    .flatMap(s =>
      s.containers.map(c => ({ ...c, timestamp: s.timestamp })),
    )
    .reduce(
      (acc, c) => ({
        ...acc,
        [c.name]: [
          ...(acc[c.name] || []),
          {
            value: SUPPORTED_CONTAINER_METRICS[metricName].parse(
              c[metricName],
            ),
            timestamp: c.timestamp,
          },
        ],
      }),
      {},
    );

  Object.entries(metricsByContainer).forEach(
    ([containerName, valuesWithTimestamp]) => {
      if (
        valuesWithTimestamp.length && valuesWithTimestamp.map(c => c.value).every(v => v > maxValue)
      ) {
        slack.alert({
          text: `${appLink}\n*${containerName}*: container compromised\n*${metricName}*: Latest ${
            valuesWithTimestamp.length
          } metrics are above ${SUPPORTED_CONTAINER_METRICS[
            metricName
          ].format(maxValue)}\n${valuesWithTimestamp
            .map(
              valueWithTimestamp =>
                `${getFormattedTimestamp(
                  valueWithTimestamp.timestamp,
                )}: ${SUPPORTED_CONTAINER_METRICS[metricName].format(
                  valueWithTimestamp.value,
                )}`,
            )
            .join(
              '\n',
            )}\n*Metrics*\n${lastMetricsText}\n*Containers*\n${lastContainerText}`,
        });
      }
    },
  );
};

export const sync = async options => {
  const slack = getSlack(options);
  fs.ensureFileSync(options.persistentStorage);
  const storage = fs.readJsonSync(options.persistentStorage, {
    throws: false,
  }) || { stats: [] };
  let browser = null;
  let page = null;
  try {
    browser = await puppeteer.launch({
      defaultViewport: null,
      ...(options.puppeteer || {}),
    });

    page = await browser.newPage();

    const appUrl = `https://galaxy.meteor.com/app/${options.appName}/containers`;
    const appLink = `${options.appName} - <${appUrl}|see on Galaxy>`;

    await page.goto(appUrl);

    await login(page, options);
    console.warn('loggedIn');
    const lastStat = await scrapeInfo(browser, page, options);
    if (
      storage.stats &&
      storage.stats.length >= options.minimumStats
    ) {
      storage.stats.shift();
    }
    storage.stats.push(lastStat);
    fs.writeJSONSync(options.persistentStorage, storage);

    await autoscale(lastStat, options, { slack, galaxy: page });

    // prepare data? format?
    const data = storage;

    const { infoRules: { send = false, channel } = {} } = options;

    const { containers, metrics, ...containerInfo } = lastStat;
    if (send) {
      slack.note({
        ...(channel ? { channel } : {}),
        text: appLink,
        attachments: [
          {
            fallback: `Check on Galaxy`,
            fields: [
              ...Object.entries(metrics).map(([title, value]) => ({
                title,
                value,
              })),
              ...Object.entries(containerInfo).map(
                ([title, value]) => ({
                  title,
                  value,
                }),
              ),
              ...containers.map(container => ({
                title: container.name,
                value: `${container.timestamp}, ${container.clients} clients, ${container.cpu}, ${container.memory}`,
              })),
            ],
          },
        ],
      });
    }
    const lastMetricsText = `${Object.entries(metrics)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')}`;
    const lastContainerText = `${Object.entries(containerInfo)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')}`;

    // not enough data to send alerts
    if (storage.stats.length < options.minimumStats) {
      return data;
    }

    const {
      alertRules: { maxInContainers = [], maxInKadira = [] } = {},
    } = options;
    Object.entries(maxInContainers).forEach(
      ([metricName, maxValue]) => {
        alertContainerMetricAboveMax({
          metricName,
          maxValue,
          data,
          slack,
          appLink,
          lastMetricsText,
          lastContainerText,
        });
      },
    );
    Object.entries(maxInKadira).forEach(([metricName, maxValue]) => {
      alertKadiraMetricAboveMax({
        metricName,
        maxValue,
        data,
        slack,
        appLink,
        lastMetricsText,
        lastContainerText,
      });
    });

    return data;
  } catch (err) {
    console.error('Error syncing', err);
    throw err;
  } finally {
    await page.close();
    await browser.close();
  }
};
