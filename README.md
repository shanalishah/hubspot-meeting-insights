# Meeting Insights (HubSpot App Backend)

Node.js + TypeScript backend scaffold for a HubSpot public app that generates meeting insights. Handles OAuth, webhooks, an OpenAI processing stub with zod validation, and writes Notes/Tasks back to HubSpot. Deployable to Vercel.

## Features
- OAuth install and callback routes
- HubSpot webhook endpoint with signature verification
- Processing pipeline with OpenAI stub and zod schema
- Writers that create Notes and Tasks
- CRM Card endpoint for latest processed insight
- Vercel serverless support

## Tech
- express, axios, zod, dotenv, @hubspot/api-client, openai (stub), body-parser, crypto, typescript, ts-node-dev

## Project Structure
```
src/
  app.ts
  server.ts
  oauth.ts
  webhooks.ts
  processors.ts
  writers.ts
  crmCard.ts
api/
  index.ts          # Vercel entry
vercel.json
```

## Environment Variables

Create a `.env` in the project root with:

```
PORT=3000
APP_BASE_URL=http://localhost:3000

HUBSPOT_CLIENT_ID=your_client_id
HUBSPOT_CLIENT_SECRET=your_client_secret
HUBSPOT_SCOPES=crm.objects.meetings.read crm.objects.notes.read crm.objects.notes.write crm.objects.tasks.write crm.objects.contacts.read crm.objects.deals.read crm.objects.companies.read
HUBSPOT_REDIRECT_URI=http://localhost:3000/oauth/callback

HUBSPOT_APP_ID=your_app_id
HUBSPOT_WEBHOOK_SECRET=your_webhook_secret

OPENAI_API_KEY=optional_for_stub

SESSION_SECRET=dev-secret
```

Note: `.env.example` is omitted here to avoid workspace restrictions; copy the above block.

## Local Development
1. Install deps: `npm install`
2. Start dev server: `npm run dev`
3. Visit install URL: `http://localhost:3000/oauth/install`

Health check: `GET /health`

## Webhooks
Configure HubSpot webhooks to POST to `POST /webhooks/hubspot`. Signature verification uses `X-HubSpot-Signature` with base64 HMAC SHA-256 of `method + uri + body + appId`.

## CRM Card
`GET /crm-card?portalId={portalId}&objectId={objectId}` returns the latest processed insight (stored in-memory).

## HubSpot Developer App Setup (Public App)
1. Create a Public App in HubSpot Developer account.
2. Set OAuth Redirect URL to `http://localhost:3000/oauth/callback` (and your deployed URL later).
3. Add scopes: `crm.objects.meetings.read crm.objects.notes.read crm.objects.notes.write crm.objects.tasks.write crm.objects.contacts.read crm.objects.deals.read crm.objects.companies.read`.
4. Copy `Client ID`, `Client Secret`, `App ID` into your `.env`.
5. Configure Webhooks: subscribe to meeting and note events; set URL to `https://<your-host>/webhooks/hubspot` and set `WEBHOOK_SECRET` to the same as `HUBSPOT_WEBHOOK_SECRET`.

## Tunneling with ngrok (Local Webhooks)
1. Run: `ngrok http 3000`
2. Use the https URL from ngrok in your HubSpot app for webhooks and OAuth redirect (if needed).
3. Set `APP_BASE_URL` to the ngrok URL while testing.

## Deploy (Render)
1. Create a new Web Service on Render, connect this repo.
2. Build command: `npm install && npm run build`
3. Start command: `node dist/server.js`
4. Set environment variables on Render matching `.env`.
5. Update `APP_BASE_URL` and `HUBSPOT_REDIRECT_URI` to your Render URL.

## Deploy (Vercel)
1. Set environment variables in Vercel (same as above)
2. Use the included `vercel.json`. Routes are served by `api/index.ts`.
3. Update `APP_BASE_URL` and `HUBSPOT_REDIRECT_URI` to your production URL.

## Notes
- Token storage is in-memory for demo purposes; replace with persistent storage for production.
- OpenAI integration is stubbed; replace `callOpenAIStub` in `src/processors.ts` with a real call and validate output with zod.