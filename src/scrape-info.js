import { WAIT_SELECTOR_TIMEOUT } from './constants';
import { bringToFront, waitForShortTime } from './utilities';

export const scrapeInfo = async (browser, galaxy, apm) => {
  await bringToFront(galaxy);

  const quantity = await galaxy.$$eval(
    '.cardinal-number.editable > div > input[type=number]',
    c => c[0].value
  );
  const type = await galaxy.$$eval('.cardinal-subtext', c => c[0].innerText);
  const [running, unavailable] = await galaxy.$$eval(
    '.cardinal-number > span',
    r => [r[0].innerText, r[1].innerText]
  );
  const scaling = await galaxy.$eval(
    '.lower-row',
    item => !!item.querySelector('.drawer.arrow-third')
  );
  const containersWithGalaxyInfo = await galaxy.$$eval(
    '.container-item',
    items =>
      items.map(item => ({
        name: item.querySelector('.truncate').innerText,
        timestamp: item.querySelector('.timestamp').innerText,
        clients: parseInt(
          item.querySelector('.clients > svg > .value > text').innerHTML,
          10
        ),
        cpu: item.querySelector('.cpu > svg > .value > text').innerHTML,
        memory: item.querySelector('.memory > svg > .value > text').innerHTML,
        starting: !!item.querySelector('.app-status.starting.small'),
        running: !!item.querySelector('.app-status.running.small'),
        stopping: !!item.querySelector('.app-status.stopping.small'),
      }))
  );

  await bringToFront(apm);

  const texts = await apm.$$eval('.item', items =>
    items.map(item => item.querySelector('.value').innerText)
  );
  const [
    pubSubResponseTimeText,
    methodResponseTimeText,
    memoryUsageByHostText,
    cpuUsageAverageText,
    sessionsByHostText,
  ] = texts;
  const metrics = {
    pubSubResponseTime: pubSubResponseTimeText,
    methodResponseTime: methodResponseTimeText,
    memoryUsageByHost: memoryUsageByHostText,
    cpuUsageAverage: cpuUsageAverageText,
    sessionsByHost: sessionsByHostText,
  };

  const containers = [];
  for (const container of containersWithGalaxyInfo) {
    try {
      const containerSelector = `li[class="${container.name}"] a`;

      // eslint-disable-next-line no-await-in-loop
      await apm.waitForSelector(containerSelector, {
        timeout: WAIT_SELECTOR_TIMEOUT,
      });
      // eslint-disable-next-line no-await-in-loop
      await apm.click('#hosts + .dropdown-toggle');
      // eslint-disable-next-line no-await-in-loop
      await apm.click(containerSelector);
      const containerActiveSelector = `li[class="active ${container.name}"] a`;
      // eslint-disable-next-line no-await-in-loop
      await apm.waitForSelector(containerActiveSelector, {
        timeout: WAIT_SELECTOR_TIMEOUT,
      });
      // eslint-disable-next-line no-await-in-loop
      await apm.waitForSelector('.summery-inner .loading-indicator', {
        hidden: true,
        timeout: WAIT_SELECTOR_TIMEOUT,
      });
      // eslint-disable-next-line no-await-in-loop
      await waitForShortTime(apm);
      // eslint-disable-next-line no-await-in-loop
      const values = await apm.$$eval('.item', items =>
        items.map(item => item.querySelector('.value').innerText)
      );
      const [
        pubSubResponseTime,
        methodResponseTime,
        memoryUsageByHost,
        cpuUsageAverage,
        sessionsByHost,
      ] = values;
      containers.push({
        ...container,
        pubSubResponseTime,
        methodResponseTime,
        memoryUsageByHost,
        cpuUsageAverage,
        sessionsByHost,
      });
    } catch (e) {
      // Ignore timeout errors to solve a scenario of some containers
      // aren't found on APM because a delay on last containers started.
      console.error(e);
    }
  }

  return {
    type,
    quantity,
    running,
    scaling,
    unavailable,
    containers,
    metrics,
    // eslint-disable-next-line no-bitwise
    timestamp: (new Date().getTime() / 1000) | 0,
  };
};
