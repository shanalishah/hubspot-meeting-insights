import { Client } from '@hubspot/api-client';
import type { MeetingInsight } from './processors';

type WriteParams = {
  sourceObjectType: 'meetings' | 'notes';
  sourceObjectId: string;
  insight: MeetingInsight;
};

export async function writeNoteAndTasks(client: Client, params: WriteParams): Promise<void> {
  const { sourceObjectType, sourceObjectId, insight } = params;

  const noteBody = renderInsightAsMarkdown(insight);
  const noteResp = await client.crm.objects.basicApi.create('notes', {
    properties: {
      hs_note_body: noteBody
    },
    associations: [] as any
  } as any);

  // Associate note with the source object and contacts/deals if present
  try {
    await (client.crm.objects as any).associationsApi.create('notes', noteResp.id!, sourceObjectType, sourceObjectId, [ { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 190 } ]);
  } catch {
    // best-effort
  }

  const related = await getRelatedObjectIds(client, sourceObjectType, sourceObjectId);
  // Associate note with related contacts, deals, companies
  for (const [objType, ids] of Object.entries(related)) {
    for (const id of ids) {
      try {
        await (client.crm.objects as any).associationsApi.create('notes', noteResp.id!, objType, id, [ { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 190 } ]);
      } catch {
        // continue
      }
    }
  }

  // Create tasks for action items
  for (const item of insight.action_items || []) {
    try {
      const taskResp = await client.crm.objects.basicApi.create('tasks', {
        properties: {
          hs_task_body: typeof item === 'string' ? item : item.title,
          hs_task_status: 'WAITING',
          hs_task_priority: typeof item === 'string' ? 'LOW' : (item.priority?.toUpperCase() === 'HIGH' ? 'HIGH' : item.priority?.toUpperCase() === 'LOW' ? 'LOW' : 'MEDIUM'),
          hs_task_due_date: typeof item === 'string' ? undefined : item.suggested_due_date
        },
        associations: [] as any
      } as any);
      // Associate tasks to related objects as well
      try {
        await (client.crm.objects as any).associationsApi.create('tasks', taskResp.id!, sourceObjectType, sourceObjectId, [ { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 190 } ]);
      } catch {}
      for (const [objType, ids] of Object.entries(related)) {
        for (const id of ids) {
          try {
            await (client.crm.objects as any).associationsApi.create('tasks', taskResp.id!, objType, id, [ { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 190 } ]);
          } catch {}
        }
      }

      // Assign owner if we can match owner_email
      if (typeof item !== 'string' && item.owner_email) {
        try {
          const owners = await (client as any).crm.owners.ownersApi.getPage();
          const match = owners?.results?.find((o: any) => (o.email || o.user?.email) === item.owner_email);
          if (match?.id) {
            await (client.crm.objects as any).basicApi.update('tasks', taskResp.id!, { properties: { hubspot_owner_id: String(match.id) } });
          }
        } catch {}
      }
    } catch {
      // continue
    }
  }
}

async function getRelatedObjectIds(client: Client, sourceObjectType: string, sourceObjectId: string): Promise<Record<'contacts' | 'deals' | 'companies', string[]>> {
  const result: Record<'contacts' | 'deals' | 'companies', string[]> = { contacts: [], deals: [], companies: [] };
  const targets: Array<'contacts' | 'deals' | 'companies'> = ['contacts', 'deals', 'companies'];
  for (const target of targets) {
    try {
      const assoc = await (client.crm.objects as any).associationsApi.getAll(sourceObjectType, sourceObjectId, target);
      const ids = (assoc?.results || []).map((r: any) => String(r.toObjectId || r.toObject?.id || r.id)).filter(Boolean);
      result[target] = ids;
    } catch {
      // ignore missing associations
    }
  }
  return result;
}

function renderInsightAsMarkdown(insight: MeetingInsight): string {
  const lines: string[] = [];
  lines.push(`**Meeting Insights**`);
  lines.push('');
  lines.push(insight.summary);
  lines.push('');
  if (insight.decisions?.length) {
    lines.push('**Decisions**');
    for (const d of insight.decisions) lines.push(`- ${d}`);
    lines.push('');
  }
  if (insight.action_items?.length) {
    lines.push('**Action Items**');
    for (const a of insight.action_items) {
      if (typeof a === 'string') {
        lines.push(`- [ ] ${a}`);
      } else {
        const meta: string[] = [];
        if (a.owner_email) meta.push(`owner: ${a.owner_email}`);
        if (a.suggested_due_date) meta.push(`due: ${a.suggested_due_date}`);
        if (a.priority) meta.push(`priority: ${a.priority}`);
        const suffix = meta.length ? ` (${meta.join(', ')})` : '';
        lines.push(`- [ ] ${a.title}${suffix}`);
      }
    }
    lines.push('');
  }
  if (insight.next_steps?.length) {
    lines.push('**Next Steps**');
    for (const n of insight.next_steps) lines.push(`- ${n}`);
    lines.push('');
  }
  return lines.join('\n');
}


