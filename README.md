# Meteor Galaxy Auto Scaling
[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors)

NodeJS command line tool to monitor and auto-scale Meteor Galaxy

## Settings

```json
{
  "appName": "your app host",
  "username": "your Galaxy username",
  "password": "your Galaxy password",
  "slackWebhook": "your Slack webhook URL",
  "silentSlack": false,
  "persistentStorage": "full path to where we want to storage scrapped info",
  "infoRules": {
    "send": false
  },
  "alertRules": {
    "maxInContainers": {
      "cpu": 1,
      "memory": 10,
      "clients": 5
    }
  },
  "autoscaleRules": {
    "containersToScale": 2,
    "minContainers": 2,
    "maxContainers": 10,
    "addWhen": {
      "responseTimeAbove": 300,
      "cpuAbove": 50
    },
    "reduceWhen": {
      "responseTimeBelow": 150,
      "cpuBelow": 25
    },
    "killWhen": {
      "responseTimeAbove": 300,
      "cpuAbove": 50,
      "sessionsAbove": 40
    }
  },
  "minimumStats": 5,
  "puppeteer": {
    "headless": false
  }
}

```

## Auto scale rules

The autoscaling behavior is meant to adjust smartly the containers on the Galaxy server taking into account the data got from there and a predefined configuration. This behavior is part of the process that reports the alerts of the galaxy state, so it is run each X minutes.

- You are able to tweak the configuration for each app by setting the conditions to run the add containers (`addWhen`), reduce containers (`reduceWhen`) or kill containers (`killWhen`) behaviors.

- The conditions available are: "[responseTime|cpu|sessions][Above|Below]". You can check the examples on this PR.

- The conditions express the property average on the active containers. The active containers are those that are running, not being starting or stoping.

- The conditions are solved by an `AND`. Any condition absence means to not consider it for the checking. So, if we only provide to `addWhen` behavior the `responseTimeAbove: 300` condition, such behavior will only run every time the response time are above 300ms.

- The `addWhen` and `reduceWhen` behaviors check to not go beyond a containers count range. This range is described by the `minContainers` and `maxContainers` configuration.

- The `addWhen` and `reduceWhen` behaviors won't run if a scaling is happening. If any other condition passes it will run on the next run.

- The `killWhen` behavior tries to kill the container with high CPU consumption and that matches the conditions configured.

- An slack alert is sent anytime a scaling behavior is triggered.

## Fixing Puppeteer on Ubuntu 16.04
sudo apt-get install libx11-xcb1 libxcomposite1 libxi6 libxext6 libxtst6 libnss3 libcups2 libxss1 libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore -->
<table>
  <tr>
    <td align="center"><a href="https://es.linkedin.com/in/nachocodonergil"><img src="https://avatars3.githubusercontent.com/u/2581993?v=4" width="100px;" alt="Nacho Codoñer"/><br /><sub><b>Nacho Codoñer</b></sub></a><br /><a href="https://github.com/pathable/meteor-galaxy-auto-scaling/commits?author=Gywem" title="Code">💻</a></td>
  </tr>
</table>

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!