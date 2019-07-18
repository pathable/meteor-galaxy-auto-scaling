import '@babel/polyfill';
import 'dotenv/config';
import { sync } from './sync';

const main = async () => {
  const options = {
    appName: process.env.APP_NAME,
    username: process.env.USERNAME,
    password: process.env.PASSWORD,
    slackWebhook: process.env.SLACK_WEBHOOK,
    persistentStorage: process.env.PERSISTENT_STORAGE,
    scalingRules: {
      containersMin: 1,
      containersMax: 3,
      connectionsPerContainerMax: 80,
      connectionsPerContainerMin: 40,
    },
    infoRules: {
      send: false,
    },
    alertRules: {
      maxInContainers: {
        cpu: 1,
        memory: 10,
        clients: 5,
      },
    },
    minimumStats: 5,
    puppeteer: {
      headless: process.env.HEADLESS == 'true',
    },
  };
  const storage = await sync(options);
  console.log('storage', storage);
};

main().catch(e => console.error(e));
