import '@babel/polyfill';
import fs from 'fs-extra';
import yargs from 'yargs';
import 'dotenv/config';
import { sync } from './sync';

const main = async () => {
  const argv = yargs
    .usage('Usage: $0 --settings settings.json')
    .demandOption(['settings'])
    .option('settings', {
      description: 'path to JSON settings',
      type: 'string',
    })
    .help()
    .alias('help', 'h').argv;
  const options = fs.readJsonSync(argv.settings);
  await sync(options);
};

main().catch(e => console.error(e));
