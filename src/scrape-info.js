import { login } from './login';
import { WAIT_SELECTOR_TIMEOUT } from './constants';

export const scrapeInfo = async (browser, galaxy, options) => {
  await galaxy.waitForSelector('div.cardinal-number.editable', { timeout: WAIT_SELECTOR_TIMEOUT });
  await galaxy.waitFor(5000);

  const quantity = await galaxy.$$eval(
    '.cardinal-number.editable > div >' + ' input[type=number]',
    c => c[0].value,
  );
  const type = await galaxy.$$eval(
    '.cardinal-subtext',
    c => c[0].innerText,
  );
  const [running, unavailable] = await galaxy.$$eval(
    '.cardinal-number > span',
    r => [r[0].innerText, r[1].innerText],
  );
  const scaling = await galaxy.$eval(
    '.lower-row',
    item => !!item.querySelector('.drawer.arrow-third'),
  );
  const containersWithGalaxyInfo = await galaxy.$$eval('.container-item', items =>
    items.map(item => ({
      name: item.querySelector('.truncate').innerText,
      timestamp: item.querySelector('.timestamp').innerText,
      clients: parseInt(
        item.querySelector('.clients > svg > .value > text')
          .innerHTML,
        10,
      ),
      cpu: item.querySelector('.cpu > svg > .value > text').innerHTML,
      memory: item.querySelector('.memory > svg > .value > text')
        .innerHTML,
      starting: !!item.querySelector('.app-status.starting.small'),
      running: !!item.querySelector('.app-status.running.small'),
      stopping: !!item.querySelector('.app-status.stopping.small'),
    })),
  );
  await galaxy.click('.complementary');
  const apmTarget = await browser.waitForTarget(target =>
    target.url().includes('apm.meteor.com')
    , { timeout: WAIT_SELECTOR_TIMEOUT });
  const apm = await apmTarget.page();
  await apm.waitFor(10000);
  await apm.click('button#sign-in-with-meteor');
  const dialogTarget = await browser.waitForTarget(target =>
    target.url().includes('www.meteor.com')
    , { timeout: WAIT_SELECTOR_TIMEOUT });
  const dialog = await dialogTarget.page();
  await login(dialog, options, {
    usernameFieldName: 'usernameOrEmail',
    submitNodeType: 'input',
  });
  await apm.waitForSelector('#main-nav', { timeout: WAIT_SELECTOR_TIMEOUT });

  const [
    pubSubResponseTime,
    methodResponseTime,
    memoryUsageByHost,
    cpuUsageAverage,
    sessionsByHost,
  ] = await apm.$$eval('.item', items =>
    items.map(item => item.querySelector('.value').innerText),
  );
  const metrics = {
    pubSubResponseTime,
    methodResponseTime,
    memoryUsageByHost,
    cpuUsageAverage,
    sessionsByHost,
  };

  const containers = [];
  for (let container of containersWithGalaxyInfo) {
    const containerSelector = `li[class="${container.name}"] a`;
    await apm.waitForSelector(containerSelector, { timeout: WAIT_SELECTOR_TIMEOUT });
    await apm.click('#hosts + .dropdown-toggle');
    await apm.click(containerSelector);
    const containerActiveSelector = `li[class="active ${container.name}"] a`;
    await apm.waitForSelector(containerActiveSelector);
    await apm.waitForSelector('.summery-inner .loading-indicator', { hidden: true, timeout: WAIT_SELECTOR_TIMEOUT });
    await apm.waitFor(1000);
    const [
      pubSubResponseTime,
      methodResponseTime,
      memoryUsageByHost,
      cpuUsageAverage,
      sessionsByHost,
    ] = await apm.$$eval('.item', items =>
      items.map(item => item.querySelector('.value').innerText),
    );
    containers.push({
      ...container,
      pubSubResponseTime,
      methodResponseTime,
      memoryUsageByHost,
      cpuUsageAverage,
      sessionsByHost,
    });
  }

  return {
    type,
    quantity,
    running,
    scaling,
    unavailable,
    containers,
    metrics,
    timestamp: new Date().getTime()/1000|0,
  };
};
