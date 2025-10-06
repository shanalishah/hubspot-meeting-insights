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
PORT=3010
APP_BASE_URL=http://localhost:3010

# Private App token mode
HUBSPOT_PRIVATE_APP_TOKEN=pat-************************
HUBSPOT_WEBHOOK_SECRET=your_webhook_secret

# Optional
OPENAI_API_KEY=optional_for_stub
```

Note: `.env.example` is omitted here to avoid workspace restrictions; copy the above block.

Auto-base detection: If `APP_BASE_URL` is not set, the server will infer it from each incoming request’s protocol/host (supports proxies/ngrok via `x-forwarded-proto` and `x-forwarded-host`). This ensures the landing links work in local, ngrok, Render.

## Local Development
1. Install deps: `npm install`
2. Start dev + tunnel: `npm run dev:tunnel` (starts server and ngrok)
3. Copy the printed Public URL and paste into `.env` lines shown (APP_BASE_URL, HUBSPOT_REDIRECT_URI)
4. In HubSpot app settings, set Redirect URL and Webhook URL to the printed values
5. Visit install URL printed by the tunnel script

Health check: `GET /health`

Debug: `GET /webhooks/debug` shows the last 10 webhook deliveries received (count + timestamp).

## Troubleshooting
- Redirect mismatch: ensure `.env` APP_BASE_URL and `HUBSPOT_REDIRECT_URI` match your ngrok/Render URL, and HubSpot app uses the same Redirect URL.
- 401 signature failures: confirm `HUBSPOT_WEBHOOK_SECRET` matches in both your app and HubSpot settings. Use `GET /webhooks/debug` to see if deliveries are arriving.
- Card shows "No insight yet": ensure the meeting/note was created after app install, is associated to a record, and you query `/crm-card?portalId=...&objectId=THE_ASSOCIATED_RECORD_ID` (contact/deal/company). You can also check `/debug/state?objectId=...`.

## Webhooks
Configure HubSpot webhooks to POST to `POST /webhooks/hubspot`. Signature verification uses `X-HubSpot-Signature` with base64 HMAC SHA-256 of `method + uri + body + appId`.

## CRM Card
`GET /crm-card?portalId={portalId}&objectId={objectId}` returns the latest processed insight (stored in-memory).

## Private App (easiest) Setup
1. In HubSpot, create a Private App and copy the token.
2. Set webhooks in the Private App: URL = `${APP_BASE_URL}/webhooks/hubspot`, Secret = `HUBSPOT_WEBHOOK_SECRET`, Subscriptions = Meetings + Notes (create/update).
3. Set `HUBSPOT_PRIVATE_APP_TOKEN` in `.env`.
4. Run `npm run dev:tunnel` and test `/health`, `/webhooks/debug`, and the CRM card tester.
5. Note: Private Apps cannot edit webhook subscriptions via API; configure in app settings.

## Scopes & Permissions
Not required in Private App mode. Use the Private App’s permissions and configured webhooks.

## Post-Install Success & Error Pages
- After OAuth, the app redirects to `/oauth/success?portalId=...` showing quick links (Health, Webhooks Debug, Re-install) and a CRM Card tester form.
- On error, it redirects to `/oauth/error?reason=...` with troubleshooting tips (Redirect URL must match, verify scopes, reinstall, check logs and HubSpot Webhook Logs).
- Replace `<your-host>` with your base URL (ngrok or Render). Screenshots: TODO add.

## Tunneling with ngrok (Local Webhooks)
1. Run: `ngrok http 3010`
2. Use the https URL from ngrok in your HubSpot app for webhooks and OAuth redirect (if needed).
3. Set `APP_BASE_URL` to the ngrok URL while testing.

## Deploy (Render)
1. Create a new Web Service on Render, connect this repo.
2. Add a `render.yaml` or use the UI with:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
3. Set environment variables on Render matching `.env`.
4. Update `APP_BASE_URL` and `HUBSPOT_REDIRECT_URI` to your Render URL.
5. After deploy, visit `https://your-service.onrender.com/` to check the landing page.

## Deploy (Vercel)
1. Set environment variables in Vercel (same as above)
2. Use the included `vercel.json`. Routes are served by `api/index.ts`.
3. Update `APP_BASE_URL` and `HUBSPOT_REDIRECT_URI` to your production URL.

## Finding portalId and objectId
- portalId: visible in your HubSpot portal URL or via OAuth token introspection.
- objectId:
  - meetings: open a meeting record; the URL contains the ID
  - notes: open a note activity; use the engagement ID
  - contacts/deals/companies: open the record; the URL contains the ID

## Notes
- Token storage is in-memory for demo purposes; replace with persistent storage for production.
- OpenAI integration is stubbed; replace `callOpenAIStub` in `src/processors.ts` with a real call and validate output with zod.