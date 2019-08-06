import { login } from './login';

export const scrapeInfo = async (browser, galaxy, options) => {
  await galaxy.waitForSelector('div.cardinal-number.editable');
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
    })),
  );
  await galaxy.click('.complementary');
  const apmTarget = await browser.waitForTarget(target =>
    target.url().includes('apm.meteor.com'),
  );
  const apm = await apmTarget.page();
  await apm.waitFor(10000);
  await apm.click('button#sign-in-with-meteor');
  const dialogTarget = await browser.waitForTarget(target =>
    target.url().includes('www.meteor.com'),
  );
  const dialog = await dialogTarget.page();
  await login(dialog, options, {
    usernameFieldName: 'usernameOrEmail',
    submitNodeType: 'input',
  });
  await apm.waitFor(15000);
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

  const containersWithGalaxyAndAPMInfo = containersWithGalaxyInfo.map(async container => {
    await galaxy.click(`.${container.name}`);
    await galaxy.waitForSelector(`.active.${container.name}`);
    const [
      pubSubResponseTime,
      methodResponseTime,
      memoryUsageByHost,
      cpuUsageAverage,
      sessionsByHost,
    ] = await apm.$$eval('.item', items =>
      items.map(item => item.querySelector('.value').innerText),
    );
    return {
      ...container,
      pubSubResponseTime,
      methodResponseTime,
      memoryUsageByHost,
      cpuUsageAverage,
      sessionsByHost,
    };
  });
  const containers = containersWithGalaxyAndAPMInfo;

  return {
    type,
    quantity,
    running,
    unavailable,
    containers,
    metrics,
    timestamp: new Date().getTime()/1000|0,
  };
};
