import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { processHubSpotEvent } from './processors';
import { logInfo, verifySignatureV3 } from './utils';

export const router = express.Router();
const recentDeliveries: Array<{ ts: string; count: number }> = [];

// Signature v3: X-HubSpot-Signature-v3 = base64(hmacSha256(secret, rawBody))
function verifySignature(req: Request): boolean {
  const signature = req.get('X-HubSpot-Signature-v3');
  const rawBody = (req as any).rawBody || '';
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET || '';
  return verifySignatureV3(rawBody, signature, secret);
}

router.post('/hubspot', async (req: Request, res: Response) => {
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid signature');
  }
  try {
    const events = Array.isArray(req.body) ? req.body : [];
    logInfo('Webhook received', { count: events.length });
    recentDeliveries.push({ ts: new Date().toISOString(), count: events.length });
    if (recentDeliveries.length > 10) recentDeliveries.shift();
    // Fire-and-forget processing; respond quickly to HubSpot
    void processHubSpotEvent(events);
    res.status(200).send('ok');
  } catch (_err) {
    res.status(200).send('ok');
  }
});

router.get('/debug', (_req: Request, res: Response) => {
  res.status(200).json({ recent: recentDeliveries.slice().reverse() });
});


