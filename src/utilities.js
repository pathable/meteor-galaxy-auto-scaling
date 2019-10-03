import { WAIT_LONG_TIMEOUT, WAIT_SELECTOR_TIMEOUT, WAIT_SHORT_TIMEOUT, WAIT_TIMEOUT } from './constants';
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
  await waitForTime(apm);
  await apm.waitForSelector('button#sign-in-with-meteor', { timeout: WAIT_SELECTOR_TIMEOUT });
  await apm.click('button#sign-in-with-meteor');
  const dialogTarget = await browser.waitForTarget(target =>
      target.url().includes('www.meteor.com')
    , { timeout: WAIT_SELECTOR_TIMEOUT });
  const dialog = await dialogTarget.page();
  await login(dialog, options, {
    usernameFieldName: 'usernameOrEmail',
    submitNodeType: 'input',
  });
  await apm.waitForSelector('#main-nav', { timeout: WAIT_LONG_TIMEOUT });
  await waitForShortTime(apm);
  return apm;
};

export const waitForTime = async (galaxy) => {
  await galaxy.waitFor(WAIT_TIMEOUT);
};

export const waitForShortTime = async galaxy => {
  await galaxy.waitFor(WAIT_SHORT_TIMEOUT);
};

export const logoutGalaxy = async galaxy => {
  await bringToFront(galaxy);
  const galaxyAccountMenuSelector = '.account-menu-wrapper';
  await galaxy.click(galaxyAccountMenuSelector);
  await waitForShortTime(galaxy);
  const galaxyLogoutButtonSelector = '.account-menu .link.tertiary';
  await galaxy.waitForSelector(galaxyLogoutButtonSelector, { timeout: WAIT_SELECTOR_TIMEOUT });
  await galaxy.click(galaxyLogoutButtonSelector);
  await waitForTime(galaxy);
};

export const logoutAPM = async apm => {
  await bringToFront(apm);
  const apmAccountMenuSelector = '#login-dropdown-list';
  await apm.click(apmAccountMenuSelector);
  await waitForShortTime(apm);
  const apmLogoutButtonSelector = '#login-buttons-logout';
  await apm.waitForSelector(apmLogoutButtonSelector, { timeout: WAIT_SELECTOR_TIMEOUT });
  await apm.click(apmLogoutButtonSelector);
  await waitForTime(apm);
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
};

export const times = (n, fn, context = undefined) => {
  let i = 0;
  while (fn.call(context, i) !== false && ++i < n) {}
};

export const round = (num, decimals = 2) => {
  const interDecimal = Math.pow(10, decimals);
  return Math.round(num * interDecimal) / interDecimal;
};
