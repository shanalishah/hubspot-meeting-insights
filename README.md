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

HUBSPOT_CLIENT_ID=your_client_id
HUBSPOT_CLIENT_SECRET=your_client_secret
HUBSPOT_SCOPES=crm.objects.meetings.read crm.objects.notes.read crm.objects.notes.write crm.objects.tasks.write crm.objects.contacts.read crm.objects.deals.read crm.objects.companies.read
HUBSPOT_REDIRECT_URI=http://localhost:3010/oauth/callback

HUBSPOT_APP_ID=your_app_id
HUBSPOT_WEBHOOK_SECRET=your_webhook_secret

OPENAI_API_KEY=optional_for_stub

SESSION_SECRET=dev-secret
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

## HubSpot Developer App Setup (Public App)
1. Create a Public App in HubSpot Developer account.
2. Set OAuth Redirect URL to `http://localhost:3000/oauth/callback` (and your deployed URL later).
3. Add scopes: `crm.objects.meetings.read crm.objects.notes.read crm.objects.notes.write crm.objects.tasks.write crm.objects.contacts.read crm.objects.deals.read crm.objects.companies.read`.
4. Copy `Client ID`, `Client Secret`, `App ID` into your `.env`.
5. Configure Webhooks: subscribe to meeting and note events; set URL to `https://<your-host>/webhooks/hubspot` and set `WEBHOOK_SECRET` to the same as `HUBSPOT_WEBHOOK_SECRET`.

## Scopes & Permissions
Use exactly these scopes (comma-separated):

`crm.objects.meetings.read,crm.objects.notes.read,crm.objects.notes.read,crm.objects.notes.write,crm.objects.tasks.write,crm.objects.contacts.read,crm.objects.deals.read,crm.objects.companies.read`

- conversations.read is intentionally excluded.
- Change them by editing `HUBSPOT_SCOPES` in your `.env` and mirroring the same scopes in your HubSpot Developer App.
- Quick check: open `GET /debug/scopes` to see what the app will request during OAuth.

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