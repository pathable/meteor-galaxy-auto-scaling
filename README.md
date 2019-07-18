# Meteor Galaxy Auto Scaling

Inspired by [galaxy-autoscale](https://github.com/jehartzog/galaxy-autoscale) this is a node 
program to monitor and auto-scale Meteor Galaxy

## Settings

```json
{
  "appName": "your app host",
  "username": "your Galaxy username",
  "password": "your Galaxy password",
  "slackWebhook": "your Slack webhook URL",
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
  "minimumStats": 5,
  "puppeteer": {
    "headless": false
  }
}

```