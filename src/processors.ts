import { z } from 'zod';
import { Client } from '@hubspot/api-client';
import OpenAI from 'openai';
import { writeNoteAndTasks } from './writers';
// Private App token mode - read token from env
import { withRetry, logWarn, logInfo } from './utils';

export const MeetingInsightSchema = z.object({
  summary: z.union([z.string(), z.array(z.string())]).transform((v) => Array.isArray(v) ? v.join('\n') : v).pipe(z.string().min(1)),
  decisions: z.array(z.string()).default([]),
  action_items: z.array(z.object({
    title: z.string(),
    owner_email: z.string().email().optional(),
    suggested_due_date: z.string().optional(),
    priority: z.enum(['low', 'normal', 'high']).optional()
  }).or(z.string().transform((s) => ({ title: s })))).default([]),
  next_steps: z.array(z.string()).default([])
});

export type MeetingInsight = z.infer<typeof MeetingInsightSchema>;

// In-memory latest insights for CRM card
// latest insights keyed by record type + id: e.g., contacts:123, deals:456, companies:789
const latestInsightsByPortalAndObject = new Map<string, MeetingInsight>();
const processedEventCache = new Set<string>();
const queue: any[] = [];

function enqueue(job: any) {
  queue.push(job);
  if (queue.length === 1) void drainQueue();
}

async function drainQueue() {
  while (queue.length) {
    const job = queue.shift();
    try {
      await job();
    } catch {
      // ignore to keep queue flowing
    }
  }
}

function keyByRecord(recordType: string, recordId: string) {
  return `${recordType}:${recordId}`;
}

async function fetchMeetingDetails(client: Client, meetingId: string) {
  const resp = await client.crm.objects.basicApi.getById('meetings', meetingId, ['hs_meeting_title', 'hs_meeting_start_time', 'hs_meeting_end_time', 'hs_meeting_body', 'hs_meeting_outcome'], undefined, ['contacts', 'deals', 'companies']);
  return resp;
}

async function callOpenAI(transcriptOrNotes: string): Promise<MeetingInsight> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return callOpenAIStub(transcriptOrNotes);

  const client = new OpenAI({ apiKey });
  const system = [
    'You are a meeting analyst. Return STRICT JSON only.',
    'Fields:',
    'summary (3-5 bullets string or string[]),',
    'decisions (string[]),',
    'action_items (array of { title, owner_email?, suggested_due_date?, priority (low|normal|high)? }),',
    'next_steps (2-3 bullets string[]).',
    'Do not include extra fields.'
  ].join(' ');
  const user = `INPUT:\n${transcriptOrNotes}`;
  const chat = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });

  const jsonText = chat.choices?.[0]?.message?.content;
  let parsed: unknown;
  try {
    parsed = jsonText ? JSON.parse(jsonText) : undefined;
  } catch {
    parsed = undefined;
  }
  const candidate = parsed ?? { summary: `Auto summary: ${transcriptOrNotes.slice(0, 80)}...`, decisions: [], action_items: [], next_steps: [] };
  return MeetingInsightSchema.parse(candidate);
}

async function callOpenAIStub(transcriptOrNotes: string): Promise<MeetingInsight> {
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
      const eventId = `${portalId}:${subscription}:${objectId}:${evt.eventId || evt.event_id || evt.occurredAt || evt.occurred_at}`;
      if (!portalId || !subscription || !objectId) continue;
      if (processedEventCache.has(eventId)) continue;
      processedEventCache.add(eventId);

      enqueue(async () => {
        const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN || '';
        if (!token) return;
        const client = new Client({ accessToken: token });

        if (subscription.includes('meeting') || subscription.includes('note')) {
          // Fetch details and synthesize a transcript/notes input
          let input = '';
          if (subscription.includes('meeting')) {
            const meeting = await withRetry(() => fetchMeetingDetails(client, objectId));
            input = `Title: ${meeting.properties?.hs_meeting_title || 'Untitled'}\nBody: ${meeting.properties?.hs_meeting_body || ''}`;
          } else {
            // Note created/updated; fetch note body
            const note = await withRetry(() => client.crm.objects.basicApi.getById('notes', objectId, ['hs_note_body']));
            input = `Note: ${note.properties?.hs_note_body || ''}`;
          }

          let insight: MeetingInsight;
          try {
            insight = await callOpenAI(input);
          } catch (e) {
            try {
              insight = await callOpenAI(`Return STRICT JSON only.\n\n${input}`);
            } catch (e2) {
              logWarn('LLM parse failed', { err: (e as Error)?.message || String(e), eventId, portalId, objectId });
              return;
            }
          }

          // Write back and collect associations
          const sourceType = subscription.includes('meeting') ? 'meetings' : 'notes';
          // Best-effort default owner: meeting creator email if available
          let organizerEmail: string | undefined;
          try {
            if (sourceType === 'meetings') {
              const meeting = await client.crm.objects.basicApi.getById('meetings', objectId, ['hs_created_by_user_id']);
              const creatorId = meeting.properties?.hs_created_by_user_id;
              if (creatorId) {
                const owners = await (client as any).crm.owners.ownersApi.getPage();
                const match = owners?.results?.find((o: any) => String(o.id) === String(creatorId));
                organizerEmail = match?.email || match?.user?.email;
              }
            }
          } catch {}

          await writeNoteAndTasks(client, { sourceObjectType: sourceType, sourceObjectId: objectId, insight, portalId, defaultOwnerEmail: organizerEmail });

          // Fetch associations from source to store latest insight per associated record
          for (const t of ['contacts', 'deals', 'companies'] as const) {
            try {
              const assoc = await withRetry(() => (client.crm.objects as any).associationsApi.getAll(sourceType, objectId, t));
              const ids = (assoc?.results || []).map((r: any) => String(r.toObjectId || r.toObject?.id || r.id)).filter(Boolean);
              for (const rid of ids) {
                latestInsightsByPortalAndObject.set(keyByRecord(t, rid), insight);
              }
            } catch {
              // ignore
            }
          }
          logInfo('Processed event', { eventId, portalId, objectId });
        }
      });
    } catch {
      // ignore per-event failures to avoid retry storms here
    }
  }
}

export function getLatestInsight(_portalId: string, objectId: string): MeetingInsight | undefined {
  // In MVP we key by record-type prefix; try common types with given objectId
  for (const type of ['contacts', 'deals', 'companies']) {
    const v = latestInsightsByPortalAndObject.get(`${type}:${objectId}`);
    if (v) return v;
  }
  return undefined;
}

