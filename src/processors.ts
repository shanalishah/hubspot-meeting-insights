import { z } from 'zod';
import { Client } from '@hubspot/api-client';
import { writeNoteAndTasks } from './writers';
import { getAccessTokenForPortal } from './oauth';

export const MeetingInsightSchema = z.object({
  summary: z.string().min(1),
  decisions: z.array(z.string()).default([]),
  action_items: z.array(z.string()).default([]),
  next_steps: z.array(z.string()).default([])
});

export type MeetingInsight = z.infer<typeof MeetingInsightSchema>;

// In-memory latest insights for CRM card
const latestInsightsByPortalAndObject = new Map<string, MeetingInsight>();

function key(portalId: string, objectId: string) {
  return `${portalId}:${objectId}`;
}

async function fetchMeetingDetails(client: Client, meetingId: string) {
  const resp = await client.crm.objects.basicApi.getById('meetings', meetingId, ['hs_meeting_title', 'hs_meeting_start_time', 'hs_meeting_end_time'], undefined, ['contacts', 'deals']);
  return resp;
}

async function callOpenAIStub(transcriptOrNotes: string): Promise<MeetingInsight> {
  // TODO: Replace with real OpenAI call
  const draft: MeetingInsight = {
    summary: `Auto summary: ${transcriptOrNotes.slice(0, 80)}...`,
    decisions: [],
    action_items: [],
    next_steps: []
  };
  return MeetingInsightSchema.parse(draft);
}

export async function processHubSpotEvent(events: any[]): Promise<void> {
  for (const evt of events) {
    try {
      const portalId = String(evt.portalId || evt.portal_id);
      const subscription = evt.subscriptionType || evt.subscription_type;
      const objectId = String(evt.objectId || evt.object_id);
      if (!portalId || !subscription || !objectId) continue;

      const accessToken = await getAccessTokenForPortal(portalId);
      if (!accessToken) continue;
      const client = new Client({ accessToken });

      if (subscription.includes('meeting') || subscription.includes('note')) {
        // Fetch details and synthesize a transcript/notes input
        let input = '';
        if (subscription.includes('meeting')) {
          const meeting = await fetchMeetingDetails(client, objectId);
          input = `Meeting: ${meeting.properties?.hs_meeting_title || 'Untitled'}`;
        } else {
          // Note created/updated; fetch note body
          const note = await client.crm.objects.basicApi.getById('notes', objectId, ['hs_note_body']);
          input = `Note: ${note.properties?.hs_note_body || ''}`;
        }

        const insight = await callOpenAIStub(input);
        latestInsightsByPortalAndObject.set(key(portalId, objectId), insight);

        // Attempt to write back to HubSpot (associate with contacts/deals best-effort)
        await writeNoteAndTasks(client, { sourceObjectType: subscription.includes('meeting') ? 'meetings' : 'notes', sourceObjectId: objectId, insight });
      }
    } catch {
      // ignore per-event failures to avoid retry storms here
    }
  }
}

export function getLatestInsight(portalId: string, objectId: string): MeetingInsight | undefined {
  return latestInsightsByPortalAndObject.get(key(portalId, objectId));
}

