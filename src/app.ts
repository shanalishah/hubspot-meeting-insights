import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import { router as oauthRouter } from './oauth';
import { router as webhooksRouter } from './webhooks';
import { router as crmCardRouter } from './crmCard';
import { getRequestBaseUrl } from './utils';

const app = express();

// Capture raw body for webhook signature verification
app.use(
  bodyParser.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString('utf8');
    }
  })
);
app.use(bodyParser.urlencoded({ extended: false }));

// Health
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Root - minimal HTML landing
app.get('/', (req: Request, res: Response) => {
  const base = getRequestBaseUrl(req);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(
    [
      '<!doctype html>',
      '<html><head><meta charset="utf-8"><title>Meeting Insights</title></head><body>',
      '<h1>Meeting Insights (HubSpot)</h1>',
      `<p><a href="${base}/health">Health</a> | <a href="${base}/oauth/install">Install OAuth</a></p>`,
      '<h2>CRM Card Tester</h2>',
      `<form method="get" action="${base}/crm-card">`,
      '<label>Portal ID: <input type="text" name="portalId" required></label><br/>',
      '<label>Object ID: <input type="text" name="objectId" required></label><br/>',
      '<button type="submit">Fetch</button>',
      '</form>',
      '<p>See README for full setup (OAuth, webhooks, ngrok).</p>',
      '</body></html>'
    ].join('')
  );
});

// OAuth success page
app.get('/oauth/success', (req: Request, res: Response) => {
  const base = getRequestBaseUrl(req);
  const portalId = String(req.query.portalId || '');
  const now = new Date().toISOString();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send([
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>Connected</title></head><body>',
    '<h1>✅ Connected to HubSpot Successfully</h1>',
    `<p><strong>Portal:</strong> ${portalId || '(unknown)'}<br/><strong>Time:</strong> ${now}</p>`,
    '<h2>Quick Actions</h2>',
    `<p><a href="${base}/health">Health</a> | <a href="${base}/webhooks/debug">Webhooks Debug</a> | <a href="${base}/oauth/install">Re-install</a></p>`,
    '<h3>CRM Card Tester</h3>',
    `<form method="get" action="${base}/crm-card">`,
    `<input type="hidden" name="portalId" value="${portalId}">`,
    '<label>Object ID: <input type="text" name="objectId" required></label> ',
    '<button type="submit">Fetch</button>',
    '</form>',
    '<p><em>If the CRM Card says “No insight yet,” create or end a meeting or add/update a note associated with a contact, deal, or company.</em></p>',
    '</body></html>'
  ].join(''));
});

// OAuth error page
app.get('/oauth/error', (req: Request, res: Response) => {
  const base = getRequestBaseUrl(req);
  const reason = String(req.query.reason || 'unknown');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send([
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>OAuth Error</title></head><body>',
    '<h1>❌ OAuth Error</h1>',
    `<p><strong>Reason:</strong> ${reason}</p>`,
    '<h2>Troubleshooting</h2>',
    '<ul>',
    `<li>Redirect URL in HubSpot app must match ${base}/oauth/callback</li>`,
    '<li>Verify OAuth scopes</li>',
    `<li>Reinstall via <a href="${base}/oauth/install">Install</a></li>`,
    '<li>Check server logs and HubSpot Webhook Logs</li>',
    '</ul>',
    `<p><a href="${base}/health">Health</a> | <a href="${base}/oauth/install">Install</a></p>`,
    '</body></html>'
  ].join(''));
});

// Routers
app.use('/oauth', oauthRouter);
app.use('/webhooks', webhooksRouter);
app.use('/crm-card', crmCardRouter);
app.get('/debug/state', (req: Request, res: Response) => {
  const objectId = String(req.query.objectId || '');
  if (!objectId) return res.status(400).json({ error: 'Missing objectId' });
  // naive lookup across types
  const { getLatestInsight } = require('./processors');
  const insight = getLatestInsight('', objectId);
  if (!insight) return res.status(404).json({ error: 'No insight yet' });
  res.json(insight);
});

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: 'Internal Server Error', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

export default app;

