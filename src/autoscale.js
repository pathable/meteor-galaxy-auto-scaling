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
    text: `${messagePrefix} ${appLink}\n${msgTitle}\n\n*Metrics*\n${lastMetricsText}\n`,
  });
};

const checkAction = (action, rules, metrics, { andMode = true } = {}) => {
  const when = rules[action];
  const {
    responseTimeAbove,
    responseTimeBelow,
    cpuAbove,
    cpuBelow,
    sessionsAbove,
    sessionsBelow,
    memoryAbove,
    memoryBelow,
    currentCpuAbove,
    currentCpuBelow,
    currentMemoryAbove,
    currentMemoryBelow,
  } = when || {};

  const {
    pubSubResponseTimeAverage,
    methodResponseTimeAverage,
    cpuAverage,
    sessionsAverage,
    memoryAverage,
    currentCpuAverage,
    currentMemoryAverage,
  } = metrics;

  let shouldRunAction = !!when;
  if (!shouldRunAction) return false;

  console.warn(action, { andMode });

  shouldRunAction = andMode;

  const responseTime = pubSubResponseTimeAverage + methodResponseTimeAverage;
  let intermediateCheck = responseTime > responseTimeAbove;
  if (responseTimeAbove != null) {
    console.warn(
      'responseTimeAbove',
      responseTimeAbove,
      'responseTime',
      responseTime,
      intermediateCheck
    );
    shouldRunAction = intermediateCheck;
  }
  intermediateCheck = responseTime < responseTimeBelow;
  if (responseTimeBelow != null) {
    console.warn(
      'responseTimeBelow',
      responseTimeBelow,
      'responseTime',
      responseTime,
      intermediateCheck
    );
    shouldRunAction = andMode
      ? shouldRunAction && intermediateCheck
      : intermediateCheck || shouldRunAction;
  }

  intermediateCheck = cpuAverage > cpuAbove;
  if (cpuAbove != null) {
    console.warn(
      'cpuAbove',
      cpuAbove,
      'cpuAverage',
      cpuAverage,
      intermediateCheck
    );
    shouldRunAction = andMode
      ? shouldRunAction && intermediateCheck
      : intermediateCheck || shouldRunAction;
  }
  intermediateCheck = cpuAverage < cpuBelow;
  if (cpuBelow != null) {
    console.warn(
      'cpuBelow',
      cpuBelow,
      'cpuAverage',
      cpuAverage,
      intermediateCheck
    );
    shouldRunAction = andMode
      ? shouldRunAction && intermediateCheck
      : intermediateCheck || shouldRunAction;
  }

  intermediateCheck = currentCpuAverage > currentCpuAbove;
  if (currentCpuAbove != null) {
    console.warn(
      'currentCpuAbove',
      currentCpuAbove,
      'currentCpuAverage',
      currentCpuAverage,
      intermediateCheck
    );
    shouldRunAction = andMode
      ? shouldRunAction && intermediateCheck
      : intermediateCheck || shouldRunAction;
  }
  intermediateCheck = currentCpuAverage < currentCpuBelow;
  if (currentCpuBelow != null) {
    console.warn(
      'currentCpuBelow',
      currentCpuBelow,
      'currentCpuAverage',
      currentCpuAverage,
      intermediateCheck
    );
    shouldRunAction = andMode
      ? shouldRunAction && intermediateCheck
      : intermediateCheck || shouldRunAction;
  }

  intermediateCheck = memoryAverage > memoryAbove;
  if (memoryAbove != null) {
    console.warn(
      'memoryAbove',
      memoryAbove,
      'memoryAverage',
      memoryAverage,
      intermediateCheck
    );
    shouldRunAction = andMode
      ? shouldRunAction && intermediateCheck
      : intermediateCheck || shouldRunAction;
  }
  intermediateCheck = memoryAverage < memoryBelow;
  if (memoryBelow != null) {
    console.warn(
      'memoryBelow',
      memoryBelow,
      'memoryAverage',
      memoryAverage,
      intermediateCheck
    );
    shouldRunAction = andMode
      ? shouldRunAction && intermediateCheck
      : intermediateCheck || shouldRunAction;
  }

  intermediateCheck = currentMemoryAverage > currentMemoryAbove;
  if (currentMemoryAbove != null) {
    console.warn(
      'currentMemoryAbove',
      currentMemoryAbove,
      'currentMemoryAverage',
      currentMemoryAverage,
      intermediateCheck
    );
    shouldRunAction = andMode
      ? shouldRunAction && intermediateCheck
      : intermediateCheck || shouldRunAction;
  }
  intermediateCheck = currentMemoryAverage < currentMemoryBelow;
  if (currentMemoryBelow != null) {
    console.warn(
      'currentMemoryBelow',
      currentMemoryBelow,
      'currentMemoryAverage',
      currentMemoryAverage,
      intermediateCheck
    );
    shouldRunAction = andMode
      ? shouldRunAction && intermediateCheck
      : intermediateCheck || shouldRunAction;
  }

  intermediateCheck = sessionsAverage > sessionsAbove;
  if (sessionsAbove != null) {
    console.warn(
      'sessionsAbove',
      sessionsAbove,
      'sessionsAverage',
      sessionsAverage,
      intermediateCheck
    );
    shouldRunAction = andMode
      ? shouldRunAction && intermediateCheck
      : intermediateCheck || shouldRunAction;
  }
  intermediateCheck = sessionsAverage < sessionsBelow;
  if (sessionsBelow != null) {
    console.warn(
      'sessionsBelow',
      sessionsBelow,
      'sessionsAverage',
      sessionsAverage,
      intermediateCheck
    );
    shouldRunAction = andMode
      ? shouldRunAction && intermediateCheck
      : intermediateCheck || shouldRunAction;
  }

  return shouldRunAction;
};

const checkKillAction = (rules, metrics) =>
  checkAction('killWhen', rules, metrics, { andMode: true });

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

  console.warn('activeMetricsByContainer', activeMetricsByContainer);
  console.warn('activeMetrics', activeMetrics);
  console.warn('containers', containers.length);
  console.warn('runningContainers', runningContainers.length);

  const {
    minContainers = MIN_CONTAINERS,
    maxContainers = MAX_CONTAINERS,
    containersToScale = 1,
    channel,
    messagePrefix,
  } = autoscaleRules;
  const isScalingContainer = scaling;

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
  const shouldKillContainer =
    killingContainerCount + 1 !== quantity &&
    indexContainerToKill > -1 &&
    containerToKill &&
    checkKillAction(autoscaleRules, containerToKill);

  if (shouldKillContainer) {
    await galaxy.$eval(
      `.container-item:nth-child(${indexContainerToKill + 1})`,
      item => {
        const $killButton = item.querySelector('.icon-power');
        if ($killButton) {
          $killButton.click();
        }
      }
    );
    const msgTitle = `Killing container *${containerToKill.name}*`;
    console.info(msgTitle);
    trySendAlert({ msgTitle });
    await waitForTime(galaxy);
  }

  const shouldAddContainer =
    !isScalingContainer &&
    quantity < maxContainers &&
    checkAction('addWhen', autoscaleRules, activeMetrics, {
      andMode: false,
    });
  const loadingIndicatorSelector = '.drawer.arrow-third';
  if (shouldAddContainer) {
    const containersToAdd =
      quantity + containersToScale > maxContainers ? 1 : containersToScale;
    const nextContainerCount = quantity + containersToAdd;
    const msgTitle = `Scaling up containers to *${nextContainerCount}* (${containersToAdd} more)`;
    console.info(msgTitle);

    const incrementButtonSelector = '.cardinal-action.increment';
    await galaxy.waitForSelector(incrementButtonSelector, {
      timeout: WAIT_SELECTOR_TIMEOUT,
    });

    times(containersToAdd, async () => {
      await galaxy.click(incrementButtonSelector);
    });
    await galaxy.waitForSelector(loadingIndicatorSelector, {
      timeout: WAIT_SELECTOR_TIMEOUT,
    });
    await waitForTime(galaxy);

    trySendAlert({ msgTitle });
    return true;
  }

  const shouldReduceContainer =
    !isScalingContainer &&
    quantity > minContainers &&
    checkAction(
      'reduceWhen',
      autoscaleRules,
      {
        ...activeMetrics,
        sessionsAverage:
          (activeMetrics.sessionsAverage * runningContainers.length) /
          (runningContainers.length - 1),
      },
      { andMode: true }
    );
  if (shouldReduceContainer) {
    const containersToReduce =
      quantity - containersToScale < minContainers ? 1 : containersToScale;
    const nextContainerCount = quantity - containersToReduce;
    const msgTitle = `Scaling down containers to *${nextContainerCount}* (${containersToReduce} less)`;
    console.info(msgTitle);

    const decrementButtonSelector = '.cardinal-action.decrement';
    await galaxy.waitForSelector(decrementButtonSelector, {
      timeout: WAIT_SELECTOR_TIMEOUT,
    });

    times(containersToReduce, async () => {
      await galaxy.click(decrementButtonSelector);
    });
    await galaxy.waitForSelector(loadingIndicatorSelector, {
      timeout: WAIT_SELECTOR_TIMEOUT,
    });
    await waitForTime(galaxy);

    trySendAlert({ msgTitle });
    return true;
  }
  return false;
};
