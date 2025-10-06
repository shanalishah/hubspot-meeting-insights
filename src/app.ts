import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import { router as oauthRouter } from './oauth';
import { router as webhooksRouter } from './webhooks';
import { router as crmCardRouter } from './crmCard';

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

// Routers
app.use('/oauth', oauthRouter);
app.use('/webhooks', webhooksRouter);
app.use('/crm-card', crmCardRouter);

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ error: 'Internal Server Error', message: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

export default app;

