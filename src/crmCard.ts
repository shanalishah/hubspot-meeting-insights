import express, { Request, Response } from 'express';
import { getLatestInsight } from './processors';

export const router = express.Router();

// Example: GET /crm-card?portalId=123&objectId=456
router.get('/', async (req: Request, res: Response) => {
  const portalId = String(req.query.portalId || '');
  const objectId = String(req.query.objectId || '');
  if (!portalId || !objectId) {
    return res.status(400).json({ error: 'Missing portalId or objectId' });
  }
  const insight = getLatestInsight(portalId, objectId);
  if (!insight) return res.status(404).json({ error: 'No insight yet' });
  res.json({
    title: 'Meeting Insights',
    summary: insight.summary,
    actions: [
      { id: 'open_note', label: 'Open full note' },
      { id: 'create_follow_up', label: 'Create follow-up email' },
      { id: 'snooze_tasks', label: 'Snooze all tasks 2d' }
    ]
  });
});


