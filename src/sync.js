import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import slackNotify from 'slack-notify';

import { scrapeInfo } from './scrape-info';
import { login } from './login';
import {
  getFormattedTimestamp,
  getPercentualNumber,
} from './utilities';

const SUPPORTED_CONTAINER_METRICS = {
  cpu: { parse: getPercentualNumber, format: value => `${value}%` },
  memory: {
    parse: getPercentualNumber,
    format: value => `${value}%`,
  },
  clients: { parse: value => value, format: value => value },
};

const alertContainerMetricAboveMax = ({
  metricName,
  maxValue,
  data,
  slack,
  appLink,
  lastMetricsText,
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
        valuesWithTimestamp.map(c => c.value).every(v => v > maxValue)
      ) {
        slack.alert({
          text: `<!channel>\n${appLink}\n*${containerName}*: container compromised\n*${metricName}*: Latest ${
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
            .join('\n')}\n${lastMetricsText}`,
        });
      }
    },
  );
};

export const sync = async options => {
  const slack = options.slackWebhook
    ? slackNotify(options.slackWebhook)
    : () => {};
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
    const appLink = `<${appUrl}|${options.appName}>`;

    await page.goto(appUrl);

    await login(page, options);
    const lastStat = await scrapeInfo(browser, page, options);
    if (
      storage.stats &&
      storage.stats.length >= options.minimumStats
    ) {
      storage.stats.shift();
    }
    storage.stats.push(lastStat);
    fs.writeJSONSync(options.persistentStorage, storage);

    // prepare data? format?
    const data = storage;

    // slack.success('Something good happened!'); // Posts to #alerts by default
    // slack.alert('Something important happened!', storage.metrics); // Posts to #alerts by default
    const { infoRules: { send = false } = {} } = options;

    const { containers, metrics, ...rest } = lastStat;
    if (send) {
      slack.note({
        text: `${appLink} - Kadira Summary Update`,
        fields: metrics,
      });
      slack.note({
        text: `${appLink} - Galaxy Summary Update`,
        fields: rest,
      });
      slack.note({
        text: `${appLink} - Galaxy Containers Update`,
        attachments: [
          {
            fallback: `Check on Galaxy`,
            fields: containers.map(container => ({
              title: container.name,
              value: `${container.timestamp}, ${container.clients} clients, ${container.cpu}, ${container.memory}`,
            })),
          },
        ],
      });
    }
    const lastMetricsText = `${Object.entries(metrics)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n')}`;

    // not enough data to send alerts
    if (storage.stats.length < options.minimumStats) {
      return data;
    }

    const { alertRules: { maxInContainers = [] } = {} } = options;
    Object.entries(maxInContainers).forEach(
      ([metricName, maxValue]) => {
        alertContainerMetricAboveMax({
          metricName,
          maxValue,
          data,
          slack,
          appLink,
          lastMetricsText,
        });
      },
    );

    return data;
  } catch (err) {
    console.error('Error syncing', err);
    throw err;
  } finally {
    await page.close();
    await browser.close();
  }
};
