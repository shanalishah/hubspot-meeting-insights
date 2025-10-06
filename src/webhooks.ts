import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { processHubSpotEvent } from './processors';

export const router = express.Router();

// Signature v3: X-HubSpot-Signature-v3 = base64(hmacSha256(secret, rawBody))
function verifySignature(req: Request): boolean {
  const signature = req.get('X-HubSpot-Signature-v3');
  const rawBody = (req as any).rawBody || '';
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET || '';
  if (!signature || !secret) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
}

router.post('/hubspot', async (req: Request, res: Response) => {
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid signature');
  }
  try {
    const events = Array.isArray(req.body) ? req.body : [];
    // Log valid deliveries (non-sensitive)
    // eslint-disable-next-line no-console
    console.log('Webhook received', { count: events.length });
    // Fire-and-forget processing; respond quickly to HubSpot
    void processHubSpotEvent(events);
    res.status(200).send('ok');
  } catch (_err) {
    res.status(200).send('ok');
  }
});


