import { bringToFront, isScaling } from './utilities';

export const scrapeInfo = async (browser, galaxy, apm) => {
  await bringToFront(galaxy);

  const quantity = await galaxy.$$eval(
    '.cardinal-number.editable > div > input[type=number]',
    c => c[0].value
  );
  console.log(`info: galaxy: quantity=${quantity}`);
  const type = await galaxy.$$eval('.cardinal-subtext', c => c[0].innerText);
  const [running, unavailable] = await galaxy.$$eval(
    '.cardinal-number > span',
    r => [r[0].innerText, r[1].innerText]
  );
  console.log(`info: galaxy: running=${running}, unavailable=${unavailable}`);
  const scaling = await isScaling(galaxy);
  console.log(`info: galaxy: scaling=${scaling}`);

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
  return {
    type,
    quantity,
    running,
    scaling,
    unavailable,
    metrics,
    // eslint-disable-next-line no-bitwise
    timestamp: (new Date().getTime() / 1000) | 0,
  };
};
