# AI Conversations: Titles, Topics, and Supabase Integration

## Overview
The AI conversation system now supports automatic titles and topic classification while using the Supabase JavaScript client for all database access (no direct `pgPool.query` calls). This improves consistency, portability, and avoids direct PostgreSQL pooler/IP issues in containerized environments.

## Migration 037 (Schema Changes)
Add `title` and `topic` columns plus indexes for efficient filtering by topic and tenant.

```sql
-- Migration 037: Add title and topic fields to conversations
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS title VARCHAR(255);

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS topic VARCHAR(100) DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_conversations_topic ON conversations(topic);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_topic ON conversations(tenant_id, topic);

COMMENT ON COLUMN conversations.title IS 'User-friendly title for the conversation, auto-generated from first user message or manually set';
COMMENT ON COLUMN conversations.topic IS 'Category of conversation: leads, accounts, opportunities, contacts, support, general, etc.';
```

### Applying the Migration
Run the SQL above in the Supabase SQL editor or include in your automated migration pipeline. Ensure indexes are applied before testing filters.

## Automatic Title & Topic Behavior
On the FIRST user message in a conversation (role `user`):
- If `title` is empty: Set to first 50 characters of the message (append `...` if truncated).
- If `topic` is missing OR `'general'`: Run keyword classifier → sets one of: `leads`, `accounts`, `opportunities`, `contacts`, `support`, `general`.
- If `topic` is already a specific value (not `'general'`), it is NOT overwritten.
- Always updates `updated_date`.

Subsequent user messages:
- Only bump `updated_date` unless title/topic were never set.

Assistant messages (role `assistant`):
- Only bump `updated_date` after insert.

## Keyword Classification Logic (Simplified)
Matches lowercase substrings:
- `leads`: `lead`, `prospect`, `mql`, `campaign`, `source`, `pipeline gen`
- `opportunities`: `opportunity`, `deal`, `stage`, `forecast`, `proposal`, `quote`
- `accounts`: `account`, `company`, `organization`, `client`
- `contacts`: `contact`, `person`, `people`, `email list`, `phone list`
- `support`: `support`, `ticket`, `issue`, `bug`, `incident`, `helpdesk`, `sla`
- Fallback: `general`

Extend by editing `classifyTopicFromText()` in `backend/routes/ai.js`.

## Supabase Client Refactor
All conversation-related operations now use the centralized factory:
```javascript
import { getSupabaseDB } from '../lib/supabaseFactory.js';
const supa = getSupabaseDB();
```
Or for backward compatibility:
```javascript
import { getSupabaseClient } from '../lib/supabase-db.js';
const supa = getSupabaseClient();
```
Instead of:
```javascript
await pgPool.query('SELECT ...');
```
This change improves consistency and uses the existing HTTP-timed fetch wrapper for performance metrics.

### Examples
```javascript
// Create conversation
const { data, error } = await supa
  .from('conversations')
  .insert({ tenant_id, agent_name: 'crm_assistant', metadata, status: 'active' })
  .select()
  .single();

// Insert message
await supa
  .from('conversation_messages')
  .insert({ conversation_id, role: 'user', content, metadata })
  .select()
  .single();

// Update title/topic
await supa
  .from('conversations')
  .update({ title: newTitle, topic: newTopic, updated_date: new Date().toISOString() })
  .eq('id', conversationId)
  .eq('tenant_id', tenantId)
  .select()
  .single();
```

## Endpoints Summary
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ai/conversations` | POST | Create conversation (auto status=active) |
| `/api/ai/conversations` | GET | List conversations (includes title, topic, computed message_count + last excerpt) |
| `/api/ai/conversations/:id` | GET | Conversation detail with messages |
| `/api/ai/conversations/:id` | PATCH | Update `title` and/or `topic` |
| `/api/ai/conversations/:id` | DELETE | Delete conversation + messages |
| `/api/ai/conversations/:id/messages` | GET | List messages (chronological) |
| `/api/ai/conversations/:id/messages` | POST | Add message (auto title/topic on first user message) |
| `/api/ai/conversations/:id/stream` | GET (SSE) | Live updates (assistant replies) |

## Frontend Integration Notes
- Sidebar uses `title` (fallback: truncated last message) and topic badge.
- Filter dropdown allows narrowing by topic. `'All'` shows all.
- Inline rename calls PATCH endpoint with `{ title, topic }`.
- Topic auto-classification still respects manual overrides.

## Testing Checklist
1. Apply migration 037.
2. Create new conversation → send first user message containing keyword (`import leads from CSV`).
3. Verify:
   - Title set appropriately.
   - Topic = `leads`.
   - Sidebar shows badge and filter works.
4. Manually change topic to `accounts` → send second message.
   - Topic remains `accounts`.
5. SSE (`/stream`) continues to broadcast assistant replies.

## Performance Considerations
- Listing conversations performs one batched message query (no N+1).
- Index on `(tenant_id, topic)` supports fast topic-filtered multi-tenant queries.
- Timestamp updates use client-side ISO (`updated_date`) — acceptable for ordering; adjust to DB `NOW()` via RPC if strict server-time required.

## Extensibility Ideas
- Replace keyword classifier with embeddings or hosted LLM classification.
- Add `archived` status + endpoint for soft-delete.
- Add analytics endpoint summarizing topic distribution per tenant.

## Troubleshooting
| Symptom | Cause | Fix |
|---------|-------|-----|
| Title not set | Migration not applied | Run Migration 037 SQL |
| Topic always `general` | Keywords didn’t match | Extend regex patterns in classifier |
| 404 on detail | Wrong tenant_id | Ensure correct header/query param `tenant_id` |
| SSE no updates | Conversation not found or network idle timeout | Confirm conversation exists & keep connection active |

## Security Notes
- All conversation operations scoped by `tenant_id` (RLS assumed active in Supabase).
- System logs recorded through Supabase client; redact sensitive metadata before insertion if extending.

## Related Files
- `backend/routes/ai.js`
- `backend/migrations/037_add_conversation_title_topic.sql`
- `src/components/agents/ConversationSidebar.jsx`
- `src/api/conversations.js`
- `backend/lib/supabase-db.js`

---
_Last updated: 2025-11-12_
