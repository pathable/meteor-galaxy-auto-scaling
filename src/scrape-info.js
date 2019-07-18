import { login } from './login';

export const scrapeInfo = async (browser, page, options) => {
  await page.waitForSelector('div.cardinal-number.editable');
  await page.waitFor(5000);

  const quantity = await page.$$eval(
    '.cardinal-number.editable > div >' + ' input[type=number]',
    c => c[0].value,
  );
  const type = await page.$$eval(
    '.cardinal-subtext',
    c => c[0].innerText,
  );
  const [running, unavailable] = await page.$$eval(
    '.cardinal-number > span',
    r => [r[0].innerText, r[1].innerText],
  );
  const containers = await page.$$eval('.container-item', items =>
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
  await page.click('.complementary');
  const apmTarget = await browser.waitForTarget(target =>
    target.url().includes('apm.meteor.com'),
  );
  const apm = await apmTarget.page();
  await apm.waitFor(5000);
  await apm.click('button#sign-in-with-meteor');
  const dialogTarget = await browser.waitForTarget(target =>
    target.url().includes('www.meteor.com'),
  );
  const dialog = await dialogTarget.page();
  await login(dialog, options, {
    usernameFieldName: 'usernameOrEmail',
    submitNodeType: 'input',
  });
  await apm.waitFor(5000);
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

  return {
    timestamp: new Date().getTime()/1000|0,
    quantity,
    type,
    running,
    unavailable,
    containers,
    metrics,
  };
};
