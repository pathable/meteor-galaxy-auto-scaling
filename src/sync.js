import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import slackNotify from 'slack-notify';
import { scrapeInfo } from './scrape-info';
import {
  getAppLink,
  getFormattedTimestamp,
  getMillisecondsNumber,
  getPercentualNumber,
  goAndLoginAPM,
  goAndLoginGalaxy,
  logout,
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

const SUPPORTED_APP_METRICS = {
  pubSubResponseTime: {
    parse: getMillisecondsNumber,
    format: value => `${value}ms`,
  },
  methodResponseTime: {
    parse: getMillisecondsNumber,
    format: value => `${value}ms`,
  },
};

const alertAppMetricAboveMax = ({
  metricName,
  maxValue,
  data,
  slack,
  appLink,
  lastMetricsText,
  lastContainerText,
  channel,
  messagePrefix,
}) => {
  if (maxValue == null) {
    return;
  }

  const metricsWithTimestamp = data.stats
    .filter(s => s.metrics[metricName])
    .map(s => ({
      value: SUPPORTED_APP_METRICS[metricName].parse(s.metrics[metricName]),
      timestamp: s.timestamp,
    }));

  if (
    metricsWithTimestamp.length &&
    metricsWithTimestamp.map(c => c.value).every(v => v > maxValue)
  ) {
    console.log(`info: sending app alert to Slack`);
    slack.alert({
      ...(channel ? { channel } : {}),
      text: `${
        messagePrefix ? `${messagePrefix} ` : ''
      }${appLink}: application compromised\n*${metricName}*: Latest ${
        metricsWithTimestamp.length
      } metrics are above ${SUPPORTED_APP_METRICS[metricName].format(
        maxValue
      )}\n${metricsWithTimestamp
        .map(
          valueWithTimestamp =>
            `${getFormattedTimestamp(
              valueWithTimestamp.timestamp
            )}: ${SUPPORTED_APP_METRICS[metricName].format(
              valueWithTimestamp.value
            )}`
        )
        .join(
          '\n'
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
  channel,
  messagePrefix,
}) => {
  if (maxValue == null) {
    return;
  }
  const metricsByContainer = data.stats
    .flatMap(s => s.containers.map(c => ({ ...c, timestamp: s.timestamp })))
    .reduce(
      (acc, c) => ({
        ...acc,
        [c.name]: [
          ...(acc[c.name] || []),
          {
            value: SUPPORTED_CONTAINER_METRICS[metricName].parse(c[metricName]),
            timestamp: c.timestamp,
          },
        ],
      }),
      {}
    );

  Object.entries(metricsByContainer).forEach(
    ([containerName, valuesWithTimestamp]) => {
      if (
        valuesWithTimestamp.length &&
        valuesWithTimestamp.map(c => c.value).every(v => v > maxValue)
      ) {
        console.log(`info: sending container alert to Slack`);
        slack.alert({
          ...(channel ? { channel } : {}),
          text: `${
            messagePrefix ? `${messagePrefix} ` : ''
          }${appLink}\n*${containerName}*: container compromised\n*${metricName}*: Latest ${
            valuesWithTimestamp.length
          } metrics are above ${SUPPORTED_CONTAINER_METRICS[metricName].format(
            maxValue
          )}\n${valuesWithTimestamp
            .map(
              valueWithTimestamp =>
                `${getFormattedTimestamp(
                  valueWithTimestamp.timestamp
                )}: ${SUPPORTED_CONTAINER_METRICS[metricName].format(
                  valueWithTimestamp.value
                )}`
            )
            .join(
              '\n'
            )}\n*Metrics*\n${lastMetricsText}\n*Containers*\n${lastContainerText}`,
        });
      }
    }
  );
};

export const sync = async options => {
  console.log(`info: starting for ${options.appName}`);
  const slack = getSlack(options);
  fs.ensureFileSync(options.persistentStorage);
  console.log('info: reading stored metrics');
  const storage = fs.readJsonSync(options.persistentStorage, {
    throws: false,
  }) || { stats: [] };
  let browser = null;
  let galaxy = null;
  let apm = null;
  try {
    console.log('info: launching puppeteer');
    browser = await puppeteer.launch({
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(options.puppeteer || {}),
    });

    console.log('info: authenticating on Galaxy');
    galaxy = await goAndLoginGalaxy(options, browser);
    console.log('success: Galaxy log in');

    await galaxy.click('.complementary');

    console.log('info: authenticating on Meteor APM');
    apm = await goAndLoginAPM(options, browser);
    console.log('success: Meteor APM log in');

    const lastStat = await scrapeInfo(browser, galaxy, apm);
    if (storage.stats && storage.stats.length >= options.minimumStats) {
      storage.stats.shift();
    }
    storage.stats.push(lastStat);
    fs.writeJSONSync(options.persistentStorage, storage);

    await autoscale(lastStat, options, {
      slack,
      browser,
      galaxy,
      apm,
    });

    // prepare data? format?
    const data = storage;

    const {
      infoRules: {
        send = false,
        channel: infoChannel,
        messagePrefix: infoMessagePrefix,
      } = {},
    } = options;

    const appLink = getAppLink(options);
    const { containers, metrics, ...containerInfo } = lastStat;
    if (send) {
      console.log(`info: sending note to Slack`);
      slack.note({
        ...(infoChannel ? { channel: infoChannel } : {}),
        text: `${infoMessagePrefix ? `${infoMessagePrefix} ` : ''}${appLink}`,
        attachments: [
          {
            fallback: `Check on Galaxy`,
            fields: [
              ...Object.entries(metrics).map(([title, value]) => ({
                title,
                value,
              })),
              ...Object.entries(containerInfo).map(([title, value]) => ({
                title,
                value,
              })),
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
      console.log(
        `info: minimum stats (${options.minimumStats}) is not available yet, we have ${storage.stats.length}`
      );
      return data;
    }

    const {
      alertRules: {
        maxInContainers = [],
        maxInApp = [],
        channel: alertChannel,
        messagePrefix: alertMessagePrefix,
      } = {},
    } = options;
    Object.entries(maxInContainers).forEach(([metricName, maxValue]) => {
      alertContainerMetricAboveMax({
        metricName,
        maxValue,
        data,
        slack,
        appLink,
        lastMetricsText,
        lastContainerText,
        channel: alertChannel,
        messagePrefix: alertMessagePrefix,
      });
    });
    Object.entries(maxInApp).forEach(([metricName, maxValue]) => {
      alertAppMetricAboveMax({
        metricName,
        maxValue,
        data,
        slack,
        appLink,
        lastMetricsText,
        lastContainerText,
        channel: alertChannel,
        messagePrefix: alertMessagePrefix,
      });
    });

    return data;
  } catch (err) {
    console.error('Error syncing', err);
    await logout(galaxy, apm);
    if (browser) await browser.close();
    console.log(`failed: error for ${options.appName}`);
    throw err;
  } finally {
    await logout(galaxy, apm);
    if (browser) await browser.close();
    console.log(`info: finished for ${options.appName}`);
  }
};
