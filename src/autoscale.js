import { goGalaxy } from './utilities';
import { WAIT_SELECTOR_TIMEOUT } from './constants';

const MAX_CONTAINERS = 10;
const MIN_CONTAINERS = 2;

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

  let intermediateCheck = (pubSubResponseTime > responseTimeAbove || methodResponseTime > responseTimeAbove);
  if (responseTimeAbove != null) shouldRunAction = intermediateCheck;
  intermediateCheck = pubSubResponseTime < responseTimeBelow || methodResponseTime < responseTimeBelow;
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

export const autoscale = async (lastStat, options, { browser, slack } = {}) => {
  const { autoscaleRules } = options;
  if (!autoscaleRules) return false;

  const galaxy = await goGalaxy(options, browser);
  await galaxy.waitForSelector('div.cardinal-number.editable', { timeout: WAIT_SELECTOR_TIMEOUT });

  const { containers } = lastStat;
  const quantity = parseInt(lastStat.quantity, 10);

  const activeMetricsByContainer = containers.map((container, i) => {
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

  const activeMetrics = containers.reduce((avgMetrics, container, i) => {
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

  const containerToKill = activeMetricsByContainer.reduce((maxCpuContainer, container) => {
    return container.cpuUsageAverage > maxCpuContainer.cpuUsageAverage && container || maxCpuContainer;
  }, activeMetricsByContainer[0]);
  const shouldKillContainer = containerToKill && checkKillAction(autoscaleRules, containerToKill);
  if (shouldKillContainer) {
    const indexContainerToKill = activeMetricsByContainer.indexOf(containerToKill);
    console.warn('shouldKillContainer', containerToKill);
    const killButton = await galaxy.$$('.container-item')[((indexContainerToKill + 1) * 3) - 1];
    if (killButton) {
      killButton.click();
    }
  }

  const {
    minContainers = MIN_CONTAINERS,
    maxContainers = MAX_CONTAINERS,
  } = autoscaleRules;
  const shouldAddContainer = quantity < maxContainers && checkAction('addWhen', autoscaleRules, activeMetrics);
  const shouldReduceContainer = quantity > minContainers && checkAction('reduceWhen', autoscaleRules, activeMetrics);
  const loadingIndicatorSelector = '.drawer.arrow-third';
  if (shouldAddContainer) {
    console.warn('shouldAddContainer');
    const incrementButtonSelector = '.cardinal-action.increment';
    await galaxy.waitForSelector(incrementButtonSelector);
    await galaxy.click(incrementButtonSelector);
    await galaxy.waitForSelector(loadingIndicatorSelector);
  } else if (shouldReduceContainer) {
    console.warn('shouldReduceContainer');
    const decrementButtonSelector = '.cardinal-action.decrement';
    await galaxy.waitForSelector(decrementButtonSelector);
    await galaxy.click(decrementButtonSelector);
    await galaxy.waitForSelector(loadingIndicatorSelector);
    console.warn('llego');
  }
};
