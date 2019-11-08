import { WAIT_SELECTOR_TIMEOUT } from './constants';

export const login = async (
  page,
  opts,
  { usernameFieldName = 'username', submitNodeType = 'button' } = {}
) => {
  const usernameSelector = `[name="${usernameFieldName}"]`;
  await page.waitForSelector(usernameSelector, {
    timeout: WAIT_SELECTOR_TIMEOUT,
  });
  await page.type(usernameSelector, opts.username);
  await page.type('[name="password"]', opts.password);
  await page.click(`form ${submitNodeType}[type="submit"]`);
};
