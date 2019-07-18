export const getPercentualNumber = txt =>
  parseInt(txt.match(/\((.*)%\)/i)[1], 10);

export const getFormattedTimestamp = timestamp =>
  `<!date^${timestamp}^{date_short_pretty} at {time_secs}|${timestamp}>`;