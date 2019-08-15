export const getPercentualNumber = txt =>
  parseInt(txt.match(/\((.*)%\)/i)[1], 10);

export const getMillisecondsNumber = txt =>
  parseInt(txt.replace('ms', ''), 10);

export const getFormattedTimestamp = timestamp =>
  `<!date^${timestamp}^{date_short_pretty} at {time_secs}|${timestamp}>`;

export const getGalaxyUrl = options => `https://galaxy.meteor.com/app/${options.appName}/containers`;

export const goGalaxy = async (options, browser) => {
  const  page = await browser.newPage();
  const appUrl = getGalaxyUrl(options);
  await page.goto(appUrl);
  return page;
};