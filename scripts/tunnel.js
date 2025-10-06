#!/usr/bin/env node
/* eslint-disable no-console */
const { spawn } = require('child_process');

const port = process.env.PORT || '3010';

const ngrok = spawn('ngrok', ['http', port], { stdio: ['ignore', 'pipe', 'inherit'] });

let url = '';

ngrok.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  // ngrok prints a JSON line when using "ngrok http" without TTY is unreliable; parse for https URL heuristically
  const match = text.match(/https:\/\/[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-zA-Z]{2,6}\b[-a-zA-Z0-9@:%_+.~#?&/=]*/);
  if (match && match[0].startsWith('https://') && match[0] !== url) {
    url = match[0];
    const base = url.replace(/\/$/, '');
    const redirect = `${base}/oauth/callback`;
    const webhook = `${base}/webhooks/hubspot`;
    const install = `${base}/oauth/install`;
    console.log('\nngrok tunnel is up:\n');
    console.log(`Public URL: ${base}`);
    console.log('\nAdd to .env:');
    console.log(`APP_BASE_URL=${base}`);
    console.log(`HUBSPOT_REDIRECT_URI=${redirect}`);
    console.log('\nHubSpot settings:');
    console.log(`Redirect URL: ${redirect}`);
    console.log(`Webhook URL:  ${webhook}`);
    console.log('\nQuick links:');
    console.log(install);
    console.log(`${base}/webhooks/debug`);
  }
});

process.on('SIGINT', () => {
  ngrok.kill('SIGINT');
  process.exit(0);
});


