import {
  bringToFront,
  getAppLink,
  waitForTime,
  times,
  round,
  getPercentualNumber,
} from './utilities';
import { WAIT_SELECTOR_TIMEOUT } from './constants';

const MAX_CONTAINERS = 10;
const MIN_CONTAINERS = 2;

const trySendAlertToSlack = (
  { appLink, msgTitle, activeMetrics, channel, messagePrefix },
  options,
  slack
) => {
  const responseTimeAverage =
    round(activeMetrics.pubSubResponseTimeAverage) +
    round(activeMetrics.methodResponseTimeAverage);
  const activeMetricsFormatted = {
    responseTimeAverage: `${responseTimeAverage}ms`,
    pubSubResponseTimeAverage: `${round(
      activeMetrics.pubSubResponseTimeAverage
    )}ms`,
    methodResponseTimeAverage: `${round(
      activeMetrics.methodResponseTimeAverage
    )}ms`,
    memoryAverage: `${round(activeMetrics.memoryAverage)}MB`,
    cpuAverage: `${round(activeMetrics.cpuAverage)}%`,
    sessionsAverage: `${round(activeMetrics.sessionsAverage, 1)}%`,
    currentCpuAverage: `${round(activeMetrics.currentCpuAverage, 1)}%`,
    currentMemoryAverage: `${round(activeMetrics.currentMemoryAverage, 1)}%`,
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
    metricField: 'pubSubResponseTimeAverage',
    whenField: 'pubSubResponseTimeAbove',
    greaterThan: true,
  },
  {
    metricField: 'pubSubResponseTimeAverage',
    whenField: 'pubSubResponseTimeBelow',
    greaterThan: false,
  },
  {
    metricField: 'methodResponseTimeAverage',
    whenField: 'methodResponseTimeAbove',
    greaterThan: true,
  },
  {
    metricField: 'methodResponseTimeAverage',
    whenField: 'methodResponseTimeBelow',
    greaterThan: false,
  },
  {
    metricField: 'cpuAverage',
    whenField: 'cpuAbove',
    greaterThan: true,
  },
  {
    metricField: 'cpuAverage',
    whenField: 'cpuBelow',
    greaterThan: false,
  },
  {
    metricField: 'currentCpuAverage',
    whenField: 'currentCpuAbove',
    greaterThan: true,
  },
  {
    metricField: 'currentCpuAverage',
    whenField: 'currentCpuBelow',
    greaterThan: false,
  },
  {
    metricField: 'memoryAverage',
    whenField: 'memoryAbove',
    greaterThan: true,
  },
  {
    metricField: 'memoryAverage',
    whenField: 'memoryBelow',
    greaterThan: false,
  },
  {
    metricField: 'currentMemoryAverage',
    whenField: 'currentMemoryAbove',
    greaterThan: true,
  },
  {
    metricField: 'currentMemoryAverage',
    whenField: 'currentMemoryBelow',
    greaterThan: false,
  },
  {
    metricField: 'sessionsAverage',
    whenField: 'sessionsAbove',
    greaterThan: true,
  },
  {
    metricField: 'sessionsAverage',
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
  galaxy,
  loadingIndicatorSelector,
  trySendAlert,
  options,
  reason,
}) {
  const msgTitle = `Scaling up containers to *${scaleTo}* (${adding} more): ${reason}`;
  console.info(msgTitle);

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
  galaxy,
  loadingIndicatorSelector,
  trySendAlert,
  options,
  reason,
}) {
  const msgTitle = `Scaling down containers to *${scaleTo}* (${reducing} less): ${reason}`;
  console.info(msgTitle);

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
  const { scaling, containers } = lastStat;
  const quantity = parseInt(lastStat.quantity, 10);
  const runningContainers = containers.filter(container => container.running);
  const activeMetricsByContainer = runningContainers.map(container => {
    const {
      pubSubResponseTime = '0',
      methodResponseTime = '0',
      memoryUsageByHost = '0',
      cpuUsageAverage = '0',
      sessionsByHost = '0',
      cpu: currentCpu = '0',
      memory: currentMemory = '0',
    } = container;
    return {
      ...container,
      pubSubResponseTimeAverage: parseFloat(pubSubResponseTime),
      methodResponseTimeAverage: parseFloat(methodResponseTime),
      memoryAverage: parseFloat(memoryUsageByHost),
      cpuAverage: parseFloat(cpuUsageAverage),
      sessionsAverage: parseFloat(sessionsByHost),
      currentCpuAverage: parseFloat(getPercentualNumber(currentCpu)),
      currentMemoryAverage: parseFloat(getPercentualNumber(currentMemory)),
    };
  });

  const activeMetrics = runningContainers.reduce((avgMetrics, container, i) => {
    const {
      pubSubResponseTimeAverage: avgPubSubResponseTime = '0',
      methodResponseTimeAverage: avgMethodResponseTime = '0',
      memoryAverage: avgMemoryUsageByHost = '0',
      cpuAverage: avgCpuUsageAverage = '0',
      sessionsAverage: avgSessionsByHost = '0',
      currentCpuAverage: avgCurrentCpu = '0',
      currentMemoryAverage: avgCurrentMemory = '0',
    } = avgMetrics;
    const {
      pubSubResponseTime = '0',
      methodResponseTime = '0',
      memoryUsageByHost = '0',
      cpuUsageAverage = '0',
      sessionsByHost = '0',
      cpu: currentCpu = '0',
      memory: currentMemory = '0',
    } = container;

    const divisionBy =
      (i === runningContainers.length - 1 && runningContainers.length) || 1;

    return {
      ...avgMetrics,
      pubSubResponseTimeAverage:
        (parseFloat(avgPubSubResponseTime) + parseFloat(pubSubResponseTime)) /
        divisionBy,
      methodResponseTimeAverage:
        (parseFloat(avgMethodResponseTime) + parseFloat(methodResponseTime)) /
        divisionBy,
      memoryAverage:
        (parseFloat(avgMemoryUsageByHost) + parseFloat(memoryUsageByHost)) /
        divisionBy,
      cpuAverage:
        (parseFloat(avgCpuUsageAverage) + parseFloat(cpuUsageAverage)) /
        divisionBy,
      sessionsAverage:
        (parseFloat(avgSessionsByHost) + parseFloat(sessionsByHost)) /
        divisionBy,
      currentCpuAverage:
        (parseFloat(avgCurrentCpu) +
          parseFloat(getPercentualNumber(currentCpu))) /
        divisionBy,
      currentMemoryAverage:
        (parseFloat(avgCurrentMemory) +
          parseFloat(getPercentualNumber(currentMemory))) /
        divisionBy,
    };
  }, {});

  const runningContainersQuantity = runningContainers.length;

  const {
    minContainers = MIN_CONTAINERS,
    maxContainers = MAX_CONTAINERS,
    containersToScale = 1,
    channel,
    messagePrefix,
  } = autoscaleRules;
  const isScalingContainer = scaling;

  if (isScalingContainer) {
    console.info(`info: Already scaling from previous actions`);
  }

  const trySendAlert = ({ msgTitle }) =>
    trySendAlertToSlack(
      {
        appLink,
        msgTitle,
        activeMetrics,
        activeMetricsByContainer,
        channel,
        messagePrefix,
      },
      options,
      slack
    );

  const loadingIndicatorSelector = '.drawer.arrow-third';

  if (!isScalingContainer && runningContainersQuantity < minContainers) {
    const adding = minContainers - runningContainersQuantity;
    const msg = `Below minimum of containers, adding ${adding}`;
    console.info(`action: addingToMinimum: ${msg}`);
    await scaleUp({
      scaleTo: minContainers,
      adding,
      galaxy,
      loadingIndicatorSelector,
      trySendAlert,
      options,
      reason: msg,
    });
    return true;
  }

  if (!isScalingContainer && runningContainersQuantity > maxContainers) {
    const reducing = runningContainersQuantity - maxContainers;
    const msg = `Above maximum of containers, reducing ${reducing}`;
    console.info(`action: reducingToMaximum: ${msg}`);
    await scaleDown({
      scaleTo: maxContainers,
      reducing,
      galaxy,
      loadingIndicatorSelector,
      trySendAlert,
      options,
      reason: msg,
    });
    return true;
  }

  const containerToKill = activeMetricsByContainer.reduce(
    (maxCpuContainer, container) =>
      (!container.stopping &&
        !container.starting &&
        container.currentCpuAverage > maxCpuContainer.currentCpuAverage &&
        container) ||
      maxCpuContainer,
    activeMetricsByContainer[0]
  );
  const killingContainerCount = containers.reduce(
    (acc, container) =>
      container.stopping || container.starting ? acc + 1 : acc,
    0
  );
  const indexContainerToKill = containers.findIndex(
    container => container.name === containerToKill.name
  );

  const checksOrNull = checkAction(
    'killWhen',
    autoscaleRules,
    containerToKill,
    { andMode: true }
  );
  const shouldKillContainer =
    killingContainerCount + 1 !== quantity &&
    indexContainerToKill > -1 &&
    containerToKill &&
    checksOrNull;

  if (shouldKillContainer) {
    const msgTitle = `Killing container *${
      containerToKill.name
    }*: ${checkResultToText(checksOrNull)}`;
    console.info(msgTitle);

    if (options.simulation) {
      console.info(`simulation: Killing`);
    } else {
      await galaxy.$eval(
        `.container-item:nth-child(${indexContainerToKill + 1})`,
        item => {
          const $killButton = item.querySelector('.icon-power');
          if ($killButton) {
            $killButton.click();
          }
        }
      );
      trySendAlert({ msgTitle });
      await waitForTime(galaxy);
    }
  }

  const checksToAddOrNull = checkAction(
    'addWhen',
    autoscaleRules,
    activeMetrics,
    {
      andMode: false,
    }
  );
  const shouldAddContainer =
    !isScalingContainer && quantity < maxContainers && checksToAddOrNull;
  if (shouldAddContainer) {
    const containersToAdd =
      quantity + containersToScale > maxContainers ? 1 : containersToScale;
    const nextContainerCount = quantity + containersToAdd;
    await scaleUp({
      scaleTo: nextContainerCount,
      adding: containersToAdd,
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
      ...activeMetrics,
      sessionsAverage:
        (activeMetrics.sessionsAverage * runningContainersQuantity) /
        (runningContainersQuantity - 1),
    },
    { andMode: true }
  );
  const shouldReduceContainer =
    !isScalingContainer && quantity > minContainers && checksToReduceOrNull;
  if (shouldReduceContainer) {
    const containersToReduce =
      quantity - containersToScale < minContainers ? 1 : containersToScale;
    const nextContainerCount = quantity - containersToReduce;
    await scaleDown({
      scaleTo: nextContainerCount,
      reducing: containersToReduce,
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
