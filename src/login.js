export const login = async (
  page,
  opts,
  { usernameFieldName = 'username', submitNodeType = 'button' } = {},
) => {
  const usernameSelector = `[name="${usernameFieldName}"]`;
  await page.waitForSelector(usernameSelector);
  await page.type(usernameSelector, opts.username);
  await page.type('[name="password"]', opts.password);
  await page.click(`form ${submitNodeType}[type="submit"]`);
};
