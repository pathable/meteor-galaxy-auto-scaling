import { WAIT_SELECTOR_TIMEOUT } from './constants';
import { login } from './login';

export const getPercentualNumber = txt =>
  parseInt(txt.match(/\((.*)%\)/i)[1], 10);

export const getMillisecondsNumber = txt =>
  parseInt(txt.replace('ms', ''), 10);

export const getFormattedTimestamp = timestamp =>
  `<!date^${timestamp}^{date_short_pretty} at {time_secs}|${timestamp}>`;

export const getGalaxyUrl = options => `https://galaxy.meteor.com/app/${options.appName}/containers`;

export const getAppLink = options => {
  const appUrl = getGalaxyUrl(options);
  return `${options.appName} - <${appUrl}|see on Galaxy>`;
};

export const goAndLoginGalaxy = async (options, browser) => {
  const  galaxy = await browser.newPage();
  const appUrl = getGalaxyUrl(options);
  await galaxy.goto(appUrl);

  await login(galaxy, options);

  await galaxy.waitForSelector('div.cardinal-number.editable', { timeout: WAIT_SELECTOR_TIMEOUT });
  await waitForShortTime(galaxy);

  return galaxy;
};

export const goAndLoginAPM = async (options, browser) => {
  const apmTarget = await browser.waitForTarget(target =>
      target.url().includes('apm.meteor.com')
    , { timeout: WAIT_SELECTOR_TIMEOUT });
  const apm = await apmTarget.page();
  await waitForFixedTime(apm);
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
  await waitForShortTime(apm);
  return apm;
};

export const waitForContainers = async (amount, galaxy) => {
  await galaxy.waitForFunction(count => {
    const $containerList = document.querySelector('.container-list');
    const containerItems = $containerList && $containerList.querySelectorAll('.container-item');
    const containerItemsCount = containerItems && containerItems.length || 0;
    return containerItemsCount === count;
  }, {}, amount);
};

export const waitForFixedTime = async galaxy => {
  await galaxy.waitFor(5000);
};

export const waitForShortTime = async galaxy => {
  await galaxy.waitFor(1000);
};

export const logoutGalaxy = async galaxy => {
  await bringToFront(galaxy);
  const galaxyAccountMenuSelector = '.account-menu-wrapper';
  await galaxy.click(galaxyAccountMenuSelector);
  const galaxyLogoutButtonSelector = '.account-menu .link.tertiary';
  await galaxy.waitForSelector(galaxyLogoutButtonSelector);
  await galaxy.click(galaxyLogoutButtonSelector);
  await waitForFixedTime(galaxy);
};

export const logoutAPM = async apm => {
  await bringToFront(apm);
  const apmAccountMenuSelector = '#login-dropdown-list';
  await apm.click(apmAccountMenuSelector);
  const apmLogoutButtonSelector = '#login-buttons-logout';
  await apm.waitForSelector(apmLogoutButtonSelector);
  await apm.click(apmLogoutButtonSelector);
  await waitForFixedTime(apm);
};

export const logout = async (galaxy, apm) => {
  if (galaxy) {
    await logoutGalaxy(galaxy);
    await galaxy.close();
  }
  if (apm) {
    await logoutAPM(apm);
    await apm.close();
  }
};

export const bringToFront = async page => {
  await page.bringToFront();
  await waitForShortTime(page);
}
