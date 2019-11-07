# Meteor Galaxy Auto Scaling (mgas)
NodeJS command line tool to monitor and auto-scale Meteor Galaxy

[![All Contributors](https://img.shields.io/badge/all_contributors-2-orange.svg?style=flat-square
)](#contributors)

## Features
- Monitoring: reads Galaxy and Meteor APM metrics
- Alerts: reports containers and apps not running as expected
- Auto-scaling: take actions when specific conditions are met
- Send slack notifications: updates, alerts and autos-scaling messages;

## How to use
Set up in your CI or equivalent a job to call `mgas` (meteor-galaxy-auto-scaling) command from
 time to time, it's probably a good idea to use a very short period, like every 2 minutes then
  you will be always monitoring your containers.
  
First you need to install `mgas` (meteor-galaxy-auto-scaling) using yarn or npm: 
```
yarn global add @pathable/meteor-galaxy-auto-scaling
``` 
```
npm install -g @pathable/meteor-galaxy-auto-scaling
```

Then you run it informing a configuration file with your alerts and auto-scaling rules:
```
mgas --settings settings.json
```
You can have different settings for different purposes.


## Updates
Check the [log of changes](./CHANGELOG.md).

## Settings

```json
{
  "appName": "your app host (required)",
  "username": "your Galaxy username (required)",
  "password": "your Galaxy password (required)",
  "slackWebhook": "your Slack webhook URL",
  "silentSlack": false,
  "persistentStorage": "full path to where we want to storage scrapped info",
  "infoRules": {
    "send": true,   
    "channel": "#galaxy-updates" 
  },
  "alertRules": {
    "maxInContainers": {
      "cpu": 1,
      "memory": 10,
      "clients": 5
    },
    "maxInApp": {
      "pubSubResponseTime": 200,
      "methodResponseTime": 300
    }
  },
  "autoscaleRules": {
    "containersToScale": 2,
    "minContainers": 2,
    "maxContainers": 10,
    "addWhen": {
      "responseTimeAbove": 300,
      "cpuAbove": 50,
      "memoryAbove":  70,
      "sessionsAbove":  50
    },
    "reduceWhen": {
      "responseTimeBelow": 150,
      "cpuBelow": 25,
      "memoryBelow": 25,
      "sessionsBelow": 30
    },
    "killWhen": {
      "responseTimeAbove": 1000,
      "cpuAbove": 90,
      "memoryAbove":  90,
      "sessionsAbove":  100
    }
  },
  "minimumStats": 5,
  "puppeteer": {
    "headless": true
  }
}

```

## Auto scale rules

The autoscaling (`autoscaleRules`) behavior is meant to adjust smartly the containers on the
 Galaxy server taking
 into account the data got from there and a predefined configuration.

- Three actions are supported:
  - `add` containers (conditions are configured on `addWhen` json key);
  - `reduce` containers (conditions are configured on `reduceWhen` json key);
  - `kill` containers (conditions are configured on `killWhen` json key).

- The conditions available are: "[responseTime|cpu|memory|sessions][Above|Below]".

- The conditions express the property average on the active containers. The active containers are
 those that are running, the ones starting or stopping are ignored.

- Multiple conditions can be informed and they are evaluated in different ways depending on the
 action
  - `add` action evaluates with `OR`, one match is enough to add new container
  - `reduce` action evaluates with `AND`, one miss match is enough to not remove one container
  - `kill` action evaluates with `AND`, one miss match is enough to not kill the container

- The `addWhen` and `reduceWhen` behaviors check to not go beyond a containers count range. This range is described by the `minContainers` and `maxContainers` configuration.

- The `addWhen` and `reduceWhen` behaviors won't run if a scaling is happening. If any other condition passes it will run on the next run.

- The `killWhen` behavior tries to kill the container with high CPU consumption and that matches the conditions configured.

- An slack message is sent anytime a scaling behavior is triggered if you set a Slack Webhook, the
 messages are sent to the default webhook channel. You will receive messages like this
 
![info](./docs/auto-scaling.png)

## Alerts
You can set maximum limits for container metrics (CPU, memory and connected clients) and also for
 Meteor app metrics (response time for publications and methods).

Example:
```
"alertRules": {
    "maxInContainers": {
      "cpu": 1,
      "memory": 10,
      "clients": 5
    },
    "maxInApp": {
      "pubSubResponseTime": 200,
      "methodResponseTime": 300
    }
},
"minimumStats": 5,
```
You will receive an alert like this when at least `minimumStats` times in a row the current value
 was above the maximum expected.

![info](./docs/alert.png)

  Then if you run `mgas` every 2 minutes and use `minimumStatus
  ` as 5 you will get an alert when your metric is at least 10 minutes above the maximum expected
  . 
 
 `minimumStats` is set in the first level of the settings because maybe we will use this
  information in
  the future also for auto-scaling, for now auto-scaling is not considering the `minimumStats`
   value.
 
## Info rules
- Set the channel, by default will go to default webhook channel
- You will receive messages like this

![info](./docs/info.png)

## Developing
If you want to include new features that includes reading new data from Galaxy or Meteor APM you
 will probably want to run `puppeteer` watching the actions, then change `headless` setting to
  `false`.
 
```
  "puppeteer": {
    "headless": false
  }
```

## Troubleshooting

### Fixing Puppeteer on Ubuntu 16.04
sudo apt-get install libx11-xcb1 libxcomposite1 libxi6 libxext6 libxtst6 libnss3 libcups2 libxss1 libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0

## Contributions
Please open issues to discuss improvements and report bugs. Also feel free to submit PRs, it is
 always a good idea to discuss first your PR idea in the issues.
 
## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore -->
<table>
  <tr>
    <td align="center"><a href="https://www.linkedin.com/in/filipenevola/"><img src="https://avatars0.githubusercontent.com/u/437372?v=4" width="100px;" alt="Filipe Névola"/><br /><sub><b>Filipe Névola</b></sub></a><br /><a href="https://github.com/pathable/meteor-galaxy-auto-scaling/commits?author=filipenevola" title="Code">💻</a></td>
    <td align="center"><a href="https://es.linkedin.com/in/nachocodonergil"><img src="https://avatars3.githubusercontent.com/u/2581993?v=4" width="100px;" alt="Nacho Codoñer"/><br /><sub><b>Nacho Codoñer</b></sub></a><br /><a href="https://github.com/pathable/meteor-galaxy-auto-scaling/commits?author=Gywem" title="Code">💻</a></td>
  </tr>
</table>

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!

## LICENSE 
[MIT](LICENSE)