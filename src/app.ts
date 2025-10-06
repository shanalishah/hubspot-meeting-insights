import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
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
      `<p><a href="${base}/health">Health</a> | <a href="${base}/webhooks/debug">Webhooks Debug</a></p>`,
      '<p><em>Using Private App Token mode</em></p>',
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

// Removed OAuth success/error in Private App mode

// Routers
app.use('/webhooks', webhooksRouter);
app.use('/crm-card', crmCardRouter);
app.get('/debug/scopes', (req: Request, res: Response) => {
  const envScopes = String(process.env.HUBSPOT_SCOPES || '');
  const effective = envScopes; // used directly in /oauth/install
  res.status(200).json({ envScopes, effectiveScopesUsedForAuth: effective });
});
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

