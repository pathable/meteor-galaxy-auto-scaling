import { bringToFront, getAppLink, waitForTime, times, round } from './utilities';

const MAX_CONTAINERS = 10;
const MIN_CONTAINERS = 2;

const trySendAlertToSlack = ({ appLink, msgTitle, activeMetrics, activeMetricsByContainer }, options, slack) => {
  const activeMetricsFormatted = {
    pubSubResponseTime: `${round(activeMetrics.pubSubResponseTime)}ms`,
    methodResponseTime: `${round(activeMetrics.methodResponseTime)}ms`,
    memoryUsageByHost: `${round(activeMetrics.memoryUsageByHost)}MB`,
    cpuUsageAverage: `${round(activeMetrics.cpuUsageAverage)}%`,
    sessionsByHost: `${round(activeMetrics.sessionsByHost, 1)}%`,
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
  } = when || {};

  const {
    pubSubResponseTime,
    methodResponseTime,
    cpuUsageAverage,
    sessionsByHost,
  } = metrics;

  let shouldRunAction = !!when;
  if(!shouldRunAction) return false;

  shouldRunAction = andMode;

  let intermediateCheck = (pubSubResponseTime > responseTimeAbove && methodResponseTime > responseTimeAbove);
  if (responseTimeAbove != null) shouldRunAction = intermediateCheck;
  intermediateCheck = pubSubResponseTime < responseTimeBelow && methodResponseTime < responseTimeBelow;
  if (responseTimeBelow != null) shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;

  intermediateCheck = cpuUsageAverage > cpuAbove;
  if (cpuAbove != null) shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  intermediateCheck = cpuUsageAverage < cpuBelow;
  if (cpuBelow != null) shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;

  intermediateCheck = sessionsByHost > sessionsAbove;
  if (sessionsAbove != null) shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;
  intermediateCheck = sessionsByHost < sessionsBelow;
  if (sessionsBelow != null) shouldRunAction = andMode ? shouldRunAction && intermediateCheck : intermediateCheck || shouldRunAction;

  return shouldRunAction;
};

const checkKillAction = (rules, metrics) => checkAction('killWhen', rules, metrics);

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
    } = container;
    return {
      ...container,
      pubSubResponseTime: parseFloat(pubSubResponseTime),
      methodResponseTime: parseFloat(methodResponseTime),
      memoryUsageByHost: parseFloat(memoryUsageByHost),
      cpuUsageAverage: parseFloat(cpuUsageAverage),
      sessionsByHost: parseFloat(sessionsByHost),
    }
  });

  const activeMetrics = runningContainers.reduce((avgMetrics, container, i) => {
    const {
      pubSubResponseTime: avgPubSubResponseTime = '0',
      methodResponseTime: avgMethodResponseTime = '0',
      memoryUsageByHost: avgMemoryUsageByHost = '0',
      cpuUsageAverage: avgCpuUsageAverage = '0',
      sessionsByHost: avgSessionsByHost = '0',
    } = avgMetrics;
    const {
      pubSubResponseTime = '0',
      methodResponseTime = '0',
      memoryUsageByHost = '0',
      cpuUsageAverage = '0',
      sessionsByHost = '0',
    } = container;

    const divisionBy = i === containers.length - 1 && containers.length || 1;

    return {
      ...avgMetrics,
      pubSubResponseTime: (parseFloat(avgPubSubResponseTime) + parseFloat(pubSubResponseTime)) / divisionBy,
      methodResponseTime: (parseFloat(avgMethodResponseTime) + parseFloat(methodResponseTime)) / divisionBy,
      memoryUsageByHost: (parseFloat(avgMemoryUsageByHost) + parseFloat(memoryUsageByHost)) / divisionBy,
      cpuUsageAverage: (parseFloat(avgCpuUsageAverage) + parseFloat(cpuUsageAverage)) / divisionBy,
      sessionsByHost: (parseFloat(avgSessionsByHost) + parseFloat(sessionsByHost)) / divisionBy,
    };
  }, {});

  const {
    minContainers = MIN_CONTAINERS,
    maxContainers = MAX_CONTAINERS,
    containersToScale = 1,
  } = autoscaleRules;
  const isScalingContainer = scaling;

  const trySendAlert = ({ msgTitle }) =>
    trySendAlertToSlack({ appLink, msgTitle, activeMetrics, activeMetricsByContainer }, options, slack);

  const containerToKill = activeMetricsByContainer.reduce((maxCpuContainer, container) => {
    return !container.stopping && !container.starting && container.cpuUsageAverage > maxCpuContainer.cpuUsageAverage && container || maxCpuContainer;
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

  const shouldAddContainer = !isScalingContainer && quantity < maxContainers && checkAction('addWhen', autoscaleRules, activeMetrics);
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

  const shouldReduceContainer = !isScalingContainer && quantity > minContainers && checkAction('reduceWhen', autoscaleRules, activeMetrics);
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
