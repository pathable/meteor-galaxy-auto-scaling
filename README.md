# Meteor Galaxy Auto Scaling

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
  "minimumStats": 5,
  "puppeteer": {
    "headless": false
  }
}

```

## Fixing Puppeteer on Ubuntu 16.04
sudo apt-get install libx11-xcb1 libxcomposite1 libxi6 libxext6 libxtst6 libnss3 libcups2 libxss1 libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0
