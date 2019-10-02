import { bringToFront, getAppLink, waitForTime, times, round, getPercentualNumber } from './utilities';

const MAX_CONTAINERS = 10;
const MIN_CONTAINERS = 2;

const trySendAlertToSlack = ({ appLink, msgTitle, activeMetrics, activeMetricsByContainer }, options, slack) => {
  const responseTimeAverage = round(activeMetrics.pubSubResponseTimeAverage) + round(activeMetrics.methodResponseTimeAverage);
  const activeMetricsFormatted = {
    responseTimeAverage: `${responseTimeAverage}ms`,
    pubSubResponseTimeAverage: `${round(activeMetrics.pubSubResponseTimeAverage)}ms`,
    methodResponseTimeAverage: `${round(activeMetrics.methodResponseTimeAverage)}ms`,
    memoryAverage: `${round(activeMetrics.memoryAverage)}MB`,
    cpuAverage: `${round(activeMetrics.cpuAverage)}%`,
    sessionsAverage: `${round(activeMetrics.sessionsAverage, 1)}%`,
    currentCpuAverage: `${round(activeMetrics.currentCpuAverage, 1)}%`,
    currentMemoryAverage: `${round(activeMetrics.currentMemoryAverage, 1)}%`,
  };
  const lastMetricsText = `${Object.entries(activeMetricsFormatted)
    .map(([key, value]) => `*${key}*\n${value}`)
    .join('\n')}`;
  slack.alert({ text: `${appLink}\n${msgTitle}\n\n*Metrics*\n${lastMetricsText}\n` });
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
  if(!shouldRunAction) return false;

  console.log(action, { andMode });

  shouldRunAction = andMode;

  const responseTime = pubSubResponseTimeAverage + methodResponseTimeAverage;
  let intermediateCheck = responseTime > responseTimeAbove;
  if (responseTimeAbove != null) {
    console.log('responseTimeAbove', responseTimeAbove, 'responseTime', responseTime, intermediateCheck);
    shouldRunAction = intermediateCheck;
  }
  intermediateCheck = responseTime < responseTimeBelow;
  if (responseTimeBelow != null) {
    console.log('responseTimeBelow', responseTimeBelow, 'responseTime', responseTime, intermediateCheck);
    shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  }

  intermediateCheck = cpuAverage > cpuAbove;
  if (cpuAbove != null) {
    console.log('cpuAbove', cpuAbove, 'cpuAverage', cpuAverage, intermediateCheck);
    shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  }
  intermediateCheck = cpuAverage < cpuBelow;
  if (cpuBelow != null) {
    console.log('cpuBelow', cpuBelow, 'cpuAverage', cpuAverage, intermediateCheck);
    shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  }

  intermediateCheck = currentCpuAverage > currentCpuAbove;
  if (currentCpuAbove != null) {
    console.log('currentCpuAbove', currentCpuAbove, 'currentCpuAverage', currentCpuAverage, intermediateCheck);
    shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  }
  intermediateCheck = currentCpuAverage < currentCpuBelow;
  if (currentCpuBelow != null) {
    console.log('currentCpuBelow', currentCpuBelow, 'currentCpuAverage', currentCpuAverage, intermediateCheck);
    shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  }

  intermediateCheck = memoryAverage > memoryAbove;
  if (memoryAbove != null) {
    console.log('memoryAbove', memoryAbove, 'memoryAverage', memoryAverage, intermediateCheck);
    shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  }
  intermediateCheck = memoryAverage < memoryBelow;
  if (memoryBelow != null) {
    console.log('memoryBelow', memoryBelow, 'memoryAverage', memoryAverage, intermediateCheck);
    shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  }

  intermediateCheck = currentMemoryAverage > currentMemoryAbove;
  if (currentMemoryAbove != null) {
    console.log('currentMemoryAbove', currentMemoryAbove, 'currentMemoryAverage', currentMemoryAverage, intermediateCheck);
    shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  }
  intermediateCheck = currentMemoryAverage < currentMemoryBelow;
  if (currentMemoryBelow != null) {
    console.log('currentMemoryBelow', currentMemoryBelow, 'currentMemoryAverage', currentMemoryAverage, intermediateCheck);
    shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  }

  intermediateCheck = sessionsAverage > sessionsAbove;
  if (sessionsAbove != null) {
    console.log('sessionsAbove', sessionsAbove, 'sessionsAverage', sessionsAverage, intermediateCheck);
    shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  }
  intermediateCheck = sessionsAverage < sessionsBelow;
  if (sessionsBelow != null) {
    console.log('sessionsBelow', sessionsBelow, 'sessionsAverage', sessionsAverage, intermediateCheck);
    shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  }

  return shouldRunAction;
};

const checkKillAction = (rules, metrics) => checkAction('killWhen', rules, metrics, { andMode: true });

export const autoscale = async (lastStat, options, { galaxy, slack } = {}) => {
  const { autoscaleRules } = options;
  if (!autoscaleRules) return false;

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
    }
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

    const divisionBy = i === containers.length - 1 && containers.length || 1;

    return {
      ...avgMetrics,
      pubSubResponseTimeAverage: (parseFloat(avgPubSubResponseTime) + parseFloat(pubSubResponseTime)) / divisionBy,
      methodResponseTimeAverage: (parseFloat(avgMethodResponseTime) + parseFloat(methodResponseTime)) / divisionBy,
      memoryAverage: (parseFloat(avgMemoryUsageByHost) + parseFloat(memoryUsageByHost)) / divisionBy,
      cpuAverage: (parseFloat(avgCpuUsageAverage) + parseFloat(cpuUsageAverage)) / divisionBy,
      sessionsAverage: (parseFloat(avgSessionsByHost) + parseFloat(sessionsByHost)) / divisionBy,
      currentCpuAverage: (parseFloat(avgCurrentCpu) + parseFloat(getPercentualNumber(currentCpu))) / divisionBy,
      currentMemoryAverage: (parseFloat(avgCurrentMemory) + parseFloat(getPercentualNumber(currentMemory))) / divisionBy,
    };
  }, {});

  console.warn('activeMetricsByContainer', activeMetricsByContainer);
  console.warn('activeMetrics', activeMetrics);

  const {
    minContainers = MIN_CONTAINERS,
    maxContainers = MAX_CONTAINERS,
    containersToScale = 1,
  } = autoscaleRules;
  const isScalingContainer = scaling;

  const trySendAlert = ({ msgTitle }) =>
    trySendAlertToSlack({ appLink, msgTitle, activeMetrics, activeMetricsByContainer }, options, slack);

  const containerToKill = activeMetricsByContainer.reduce((maxCpuContainer, container) => {
    return !container.stopping && !container.starting && container.currentCpuAverage > maxCpuContainer.currentCpuAverage && container || maxCpuContainer;
  }, activeMetricsByContainer[0]);
  const killingContainerCount = containers.reduce((acc, container) => container.stopping || container.starting ? acc + 1 : acc, 0);
  const indexContainerToKill = containers.findIndex(container => container.name === containerToKill.name);
  const shouldKillContainer = (killingContainerCount + 1) !== quantity &&
    indexContainerToKill > -1 &&
    containerToKill && checkKillAction(autoscaleRules, containerToKill);

  if (shouldKillContainer) {
    await galaxy.$eval(`.container-item:nth-child(${indexContainerToKill + 1})`, item => {
      const $killButton = item.querySelector('.icon-power');
      if ($killButton) {
        $killButton.click();
      }
    });
    const msgTitle = `Killing container *${containerToKill.name}*`;
    console.info(msgTitle);
    trySendAlert({ msgTitle });
    await waitForTime(galaxy);
  }

  const shouldAddContainer = !isScalingContainer && quantity < maxContainers &&
    checkAction('addWhen', autoscaleRules, activeMetrics, { andMode: false });
  const loadingIndicatorSelector = '.drawer.arrow-third';
  if (shouldAddContainer) {
    const containersToAdd = quantity + containersToScale > maxContainers ? 1 : containersToScale;
    const nextContainerCount = quantity + containersToAdd;
    const msgTitle = `Scaling up containers to *${nextContainerCount}* (${containersToAdd} more)`;
    console.info(msgTitle);

    const incrementButtonSelector = '.cardinal-action.increment';
    await galaxy.waitForSelector(incrementButtonSelector);

    times(containersToAdd, async () => {
      await galaxy.click(incrementButtonSelector);
    });
    await galaxy.waitForSelector(loadingIndicatorSelector);
    await waitForTime(galaxy);

    trySendAlert({ msgTitle });
    return;
  }

  const shouldReduceContainer = !isScalingContainer && quantity > minContainers
    && checkAction('reduceWhen', autoscaleRules, activeMetrics, { andMode: true });
  if (shouldReduceContainer) {
    const containersToReduce = quantity - containersToScale < minContainers ? 1 : containersToScale;
    const nextContainerCount = quantity - containersToReduce;
    const msgTitle = `Scaling down containers to *${nextContainerCount}* (${containersToReduce} less)`;
    console.info(msgTitle);

    const decrementButtonSelector = '.cardinal-action.decrement';
    await galaxy.waitForSelector(decrementButtonSelector);

    times(containersToReduce, async () => {
      await galaxy.click(decrementButtonSelector);
    });
    await galaxy.waitForSelector(loadingIndicatorSelector);
    await waitForTime(galaxy);

    trySendAlert({ msgTitle });
  }
};
