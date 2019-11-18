import {
  bringToFront,
  getAppLink,
  waitForTime,
  times,
  round,
  isScaling,
} from './utilities';
import { WAIT_SELECTOR_TIMEOUT } from './constants';

const MAX_CONTAINERS = 10;
const MIN_CONTAINERS = 2;

const trySendAlertToSlack = (
  { appLink, msgTitle, metrics, channel, messagePrefix },
  options,
  slack
) => {
  const responseTimeAverage =
    round(metrics.pubSubResponseTimeAverage) +
    round(metrics.methodResponseTimeAverage);
  const activeMetricsFormatted = {
    responseTimeAverage: `${responseTimeAverage}ms`,
    pubSubResponseTimeAverage: `${round(metrics.pubSubResponseTimeAverage)}ms`,
    methodResponseTimeAverage: `${round(metrics.methodResponseTimeAverage)}ms`,
    memoryAverage: `${round(metrics.memoryAverage)}MB`,
    cpuAverage: `${round(metrics.cpuAverage)}%`,
    sessionsAverage: `${round(metrics.sessionsAverage, 1)}%`,
    currentCpuAverage: `${round(metrics.currentCpuAverage, 1)}%`,
    currentMemoryAverage: `${round(metrics.currentMemoryAverage, 1)}%`,
  };
  const lastMetricsText = `${Object.entries(activeMetricsFormatted)
    .map(([key, value]) => `*${key}*\n${value}`)
    .join('\n')}`;
  console.log(`info: sending auto scale message to Slack`);
  slack.note({
    ...(channel ? { channel } : {}),
    text: `${
      messagePrefix ? `${messagePrefix} ` : ''
    }${appLink}\n${msgTitle}\n\n*Metrics*\n${lastMetricsText}\n`,
  });
};

const ALL_CHECKS = [
  {
    metricField: 'pubSubResponseTime',
    whenField: 'pubSubResponseTimeAbove',
    greaterThan: true,
  },
  {
    metricField: 'pubSubResponseTime',
    whenField: 'pubSubResponseTimeBelow',
    greaterThan: false,
  },
  {
    metricField: 'methodResponseTime',
    whenField: 'methodResponseTimeAbove',
    greaterThan: true,
  },
  {
    metricField: 'methodResponseTime',
    whenField: 'methodResponseTimeBelow',
    greaterThan: false,
  },
  {
    metricField: 'cpuUsageAverage',
    whenField: 'cpuAbove',
    greaterThan: true,
  },
  {
    metricField: 'cpuUsageAverage',
    whenField: 'cpuBelow',
    greaterThan: false,
  },
  {
    metricField: 'memoryUsageByHost',
    whenField: 'memoryAbove',
    greaterThan: true,
  },
  {
    metricField: 'memoryUsageByHost',
    whenField: 'memoryBelow',
    greaterThan: false,
  },
  {
    metricField: 'sessionsByHost',
    whenField: 'sessionsAbove',
    greaterThan: true,
  },
  {
    metricField: 'sessionsByHost',
    whenField: 'sessionsBelow',
    greaterThan: false,
  },
];

function checkResultToText(scaledSuccessChecks) {
  if (!scaledSuccessChecks) {
    throw new Error(
      `scaledSuccessChecks=${scaledSuccessChecks} should never be null or undefined here`
    );
  }
  return `${scaledSuccessChecks
    .map(
      c =>
        `${c.metricField} ${c.metricValue} is ${
          c.greaterThan ? 'greater than' : 'less than'
        } ${c.whenField} ${c.whenValue}`
    )
    .join(', ')}`;
}

const checkAction = (action, rules, metricsParam, { andMode = true } = {}) => {
  const when = rules[action] || {};
  const metrics = metricsParam || {};

  const checksConfigured = ALL_CHECKS.map(check =>
    when[check.whenField] == null ? null : check
  ).filter(Boolean);
  if (!checksConfigured.length) {
    return null;
  }
  const scaledSuccessChecks = checksConfigured
    .map(check => {
      const metricValue = +metrics[check.metricField];
      const whenValue = +when[check.whenField];
      const text = `info: auto-scale: ${action}: ${
        check.metricField
      } ${metricValue} is ${check.greaterThan ? 'greater than' : 'less than'} ${
        check.whenField
      } ${whenValue} => `;
      if (check.greaterThan) {
        const isGreater = metricValue > whenValue;
        console.log(`${text}${isGreater ? 'YES' : 'NO'}`);
        return isGreater
          ? {
              ...check,
              metricValue,
              whenValue,
            }
          : null;
      }

      const isLess = metricValue < whenValue;
      console.log(`${text}${isLess ? 'YES' : 'NO'}`);
      return isLess
        ? {
            ...check,
            metricValue,
            whenValue,
          }
        : null;
    })
    .filter(Boolean);

  const check = andMode
    ? scaledSuccessChecks.length === checksConfigured.length
    : scaledSuccessChecks.length > 0;

  console.log(`info: ${action} => ${check ? 'YES' : 'NO'}`);

  if (check) {
    console.log(`action: ${action} ${checkResultToText(scaledSuccessChecks)}`);
    return scaledSuccessChecks;
  }
  return null;
};

async function scaleUp({
  scaleTo,
  adding,
  running,
  galaxy,
  loadingIndicatorSelector,
  trySendAlert,
  options,
  reason,
}) {
  const msgTitle = `Scaling up containers to *${scaleTo}* from ${running} (${adding} more): ${reason}`;
  console.info(msgTitle);

  if (await isScaling(galaxy)) {
    console.info(
      `skip: Should add container but already scaling from previous actions`
    );
    return;
  }

  if (options.simulation) {
    console.info(`simulation: Scaling up`);
    return;
  }

  const incrementButtonSelector = '.cardinal-action.increment';
  await galaxy.waitForSelector(incrementButtonSelector, {
    timeout: WAIT_SELECTOR_TIMEOUT,
  });

  times(adding, async () => {
    await galaxy.click(incrementButtonSelector);
  });
  await galaxy.waitForSelector(loadingIndicatorSelector, {
    timeout: WAIT_SELECTOR_TIMEOUT,
  });
  await waitForTime(galaxy);

  trySendAlert({ msgTitle });
}

async function scaleDown({
  scaleTo,
  reducing,
  running,
  galaxy,
  loadingIndicatorSelector,
  trySendAlert,
  options,
  reason,
}) {
  const msgTitle = `Scaling down containers to *${scaleTo}* from ${running} (${reducing} less): ${reason}`;
  console.info(msgTitle);

  if (await isScaling(galaxy)) {
    console.info(
      `skip: Should reduce container but already scaling from previous actions`
    );
    return;
  }

  if (options.simulation) {
    console.info(`simulation: Scaling down`);
    return;
  }

  const decrementButtonSelector = '.cardinal-action.decrement';
  await galaxy.waitForSelector(decrementButtonSelector, {
    timeout: WAIT_SELECTOR_TIMEOUT,
  });

  times(reducing, async () => {
    await galaxy.click(decrementButtonSelector);
  });
  await galaxy.waitForSelector(loadingIndicatorSelector, {
    timeout: WAIT_SELECTOR_TIMEOUT,
  });
  await waitForTime(galaxy);

  trySendAlert({ msgTitle });
}

export const autoscale = async (lastStat, options, { galaxy, slack } = {}) => {
  const { autoscaleRules } = options;
  if (!autoscaleRules) return false;

  console.log('info: checking auto scaling metrics');
  await bringToFront(galaxy);

  const appLink = getAppLink(options);
  const { metrics } = lastStat;
  const quantity = parseInt(lastStat.quantity, 10);
  const running = parseInt(lastStat.running, 10);

  const {
    minContainers = MIN_CONTAINERS,
    maxContainers = MAX_CONTAINERS,
    containersToScale = 1,
    channel,
    messagePrefix,
  } = autoscaleRules;

  const trySendAlert = ({ msgTitle }) =>
    trySendAlertToSlack(
      {
        appLink,
        msgTitle,
        metrics,
        channel,
        messagePrefix,
      },
      options,
      slack
    );

  const loadingIndicatorSelector = '.drawer.arrow-third';

  if (running < minContainers) {
    const adding = minContainers - running;
    const msg = `Below minimum of containers, adding ${adding}`;
    console.info(`action: addingToMinimum: ${msg}`);
    await scaleUp({
      scaleTo: minContainers,
      adding,
      running,
      galaxy,
      loadingIndicatorSelector,
      trySendAlert,
      options,
      reason: msg,
    });
    return true;
  }

  if (running > maxContainers) {
    const reducing = running - maxContainers;
    const msg = `Above maximum of containers, reducing ${reducing}`;
    console.info(`action: reducingToMaximum: ${msg}`);
    await scaleDown({
      scaleTo: maxContainers,
      reducing,
      running,
      galaxy,
      loadingIndicatorSelector,
      trySendAlert,
      options,
      reason: msg,
    });
    return true;
  }

  const checksToAddOrNull = checkAction('addWhen', autoscaleRules, metrics, {
    andMode: false,
  });
  const shouldAddContainer = quantity < maxContainers && checksToAddOrNull;

  if (shouldAddContainer) {
    const containersToAdd =
      quantity + containersToScale > maxContainers ? 1 : containersToScale;
    const nextContainerCount = quantity + containersToAdd;
    await scaleUp({
      scaleTo: nextContainerCount,
      adding: containersToAdd,
      running,
      galaxy,
      loadingIndicatorSelector,
      trySendAlert,
      options,
      reason: checkResultToText(checksToAddOrNull),
    });
    return true;
  }

  const checksToReduceOrNull = checkAction(
    'reduceWhen',
    autoscaleRules,
    {
      ...metrics,
      sessionsAverage: (metrics.sessionsAverage * running) / (running - 1),
    },
    { andMode: true }
  );
  const shouldReduceContainer =
    quantity > minContainers && checksToReduceOrNull;
  if (shouldReduceContainer) {
    const containersToReduce =
      quantity - containersToScale < minContainers ? 1 : containersToScale;
    const nextContainerCount = quantity - containersToReduce;
    await scaleDown({
      scaleTo: nextContainerCount,
      reducing: containersToReduce,
      running,
      galaxy,
      loadingIndicatorSelector,
      trySendAlert,
      options,
      reason: checkResultToText(checksToReduceOrNull),
    });
    return true;
  }
  return false;
};
