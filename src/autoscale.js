const MAX_CONTAINERS = '10';
const MIN_CONTAINERS = '2';

const checkAction = (action, rules, metrics) => {
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

  shouldRunAction = responseTimeAbove != null && (pubSubResponseTime > responseTimeAbove || methodResponseTime > responseTimeAbove);
  shouldRunAction = responseTimeBelow != null && (pubSubResponseTime < responseTimeBelow || methodResponseTime < responseTimeBelow) || shouldRunAction;

  shouldRunAction = cpuAbove != null && cpuUsageAverage > cpuAbove || shouldRunAction;
  shouldRunAction = cpuBelow != null && cpuUsageAverage > cpuBelow || shouldRunAction;

  shouldRunAction = sessionsAbove != null && sessionsByHost > sessionsAbove || shouldRunAction;
  shouldRunAction = sessionsBelow != null && cpuUsageAverage < sessionsBelow || shouldRunAction;

  return shouldRunAction;
};

export const autoscale = async (lastStat, options, { page, slack } = {}) => {
  const { autoscaleRules } = options;
  if (!autoscaleRules) return false;

  const { containers, quantity } = lastStat;

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

  console.warn('activeMetrics', activeMetrics);
  console.warn('activeMetricsByContainer', activeMetricsByContainer);

  const containerToKill = activeMetricsByContainer.reduce((maxCpuContainer, container) => {
    return container.cpuUsageAverage > maxCpuContainer.cpuUsageAverage && container || maxCpuContainer;
  }, activeMetricsByContainer[0]);
  const shouldKillContainer = checkAction('killWhen', autoscaleRules, containerToKill);
  if (shouldKillContainer) {
    console.warn('shouldKillContainer');
    // TODO(#166463636): Ensure the containerToKill is the one that the button is clicked.
  }

  const {
    minContainers = MIN_CONTAINERS,
    maxContainers = MAX_CONTAINERS,
  } = autoscaleRules;
  const shouldAddContainer = quantity < maxContainers && checkAction('addWhen', autoscaleRules, activeMetrics);
  const shouldReduceContainer = quantity > minContainers && checkAction('reduceWhen', autoscaleRules, activeMetrics);
  if (shouldAddContainer) {
    console.warn('shouldAddContainer');
    await page.click('.cardinal-action.increment');
  } else if (shouldReduceContainer) {
    console.warn('shouldReduceContainer');
    await page.click('.cardinal-action.decrement');
  }
};
