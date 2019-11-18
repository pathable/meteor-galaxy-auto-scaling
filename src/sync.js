import puppeteer from 'puppeteer';
import fs from 'fs-extra';
import rp from 'request-promise';
import merge from 'lodash.merge';
import slackNotify from 'slack-notify';
import { scrapeInfo } from './scrape-info';
import {
  getAppLink,
  getFormattedTimestamp,
  goAndLoginAPM,
  goAndLoginGalaxy,
  logout,
  SUPPORTED_APP_METRICS,
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

  console.log(`info: checking alerts about ${metricName}`);
  const metricsWithTimestamp = data.stats
    .filter(s => s.metrics[metricName])
    .map(s => ({
      value: s.metrics[metricName],
      timestamp: s.timestamp,
    }));

  if (
    metricsWithTimestamp.length &&
    metricsWithTimestamp.map(c => c.value).every(v => v > maxValue)
  ) {
    const text = `Latest ${
      metricsWithTimestamp.length
    } metrics are above ${SUPPORTED_APP_METRICS[metricName].format(maxValue)}`;
    console.log(`alert: app ${appLink}: ${text}`);
    slack.alert({
      ...(channel ? { channel } : {}),
      text: `${
        messagePrefix ? `${messagePrefix} ` : ''
      }${appLink}: application\n*${metricName}*: ${text}\n${metricsWithTimestamp
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

export const sync = async optionsParam => {
  console.log(`info: local options ${JSON.stringify(optionsParam)}`);
  const { remote } = optionsParam || {};
  let remoteOptions = {};
  if (remote && remote.url) {
    console.log(`info: getting config from remote ${remote.url}`);
    try {
      remoteOptions = JSON.parse(await rp(remote.url));
    } catch (e) {
      console.error(`Error getting remote options from ${remote.url}`, e);
    }
    console.log(`info: remote options ${JSON.stringify(remoteOptions)}`);
  }
  const options = merge(optionsParam, remoteOptions);
  console.log(`info: starting for ${options.appName}`);
  console.log(`info: options ${JSON.stringify(options)}`);

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
    const { metrics, ...containerInfo } = lastStat;
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
        maxInApp = [],
        channel: alertChannel,
        messagePrefix: alertMessagePrefix,
      } = {},
    } = options;

    console.log(`info: checking alerts for app name=${options.appName}`);
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
