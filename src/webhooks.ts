import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { processHubSpotEvent } from './processors';

export const router = express.Router();

function verifySignature(req: Request): boolean {
  const signature = req.get('X-HubSpot-Signature');
  const method = req.method;
  const uri = req.originalUrl.split('?')[0];
  const body = (req as any).rawBody || JSON.stringify(req.body || {});
  const appId = process.env.HUBSPOT_APP_ID || '';
  const clientSecret = process.env.HUBSPOT_WEBHOOK_SECRET || process.env.HUBSPOT_CLIENT_SECRET || '';
  if (!signature || !clientSecret) return false;

  const sourceString = method + uri + body + appId;
  const hash = crypto.createHmac('sha256', clientSecret).update(sourceString).digest('base64');
  return hash === signature;
}

router.post('/hubspot', async (req: Request, res: Response) => {
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid signature');
  }
  try {
    const events = Array.isArray(req.body) ? req.body : [];
    // Fire-and-forget processing; respond quickly to HubSpot
    void processHubSpotEvent(events);
    res.status(200).send('ok');
  } catch (_err) {
    res.status(200).send('ok');
  }
});


