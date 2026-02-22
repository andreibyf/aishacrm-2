# Entity Context in Conversation Messages

## Overview

The conversation_messages table metadata now includes **top-level entity IDs** extracted from AI tool interactions. This enables powerful querying capabilities and context awareness across conversation turns.

## Metadata Structure

### Before (Original)

```json
{
  "model": "gpt-4o-2024-08-06",
  "usage": { "prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150 },
  "tool_interactions": [
    {
      "name": "get_lead_details",
      "arguments": { "lead_id": "a3af0a84-a16f-466e-aa82-62b462d1d998" },
      "result_preview": "{\"name\":\"John Doe\"}"
    }
  ],
  "iterations": 1
}
```

### After (With Entity Context)

```json
{
  "model": "gpt-4o-2024-08-06",
  "usage": { "prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150 },
  "tool_interactions": [
    {
      "name": "get_lead_details",
      "arguments": { "lead_id": "a3af0a84-a16f-466e-aa82-62b462d1d998" },
      "result_preview": "{\"name\":\"John Doe\"}"
    }
  ],
  "iterations": 1,
  "lead_id": "a3af0a84-a16f-466e-aa82-62b462d1d998"
}
```

## Supported Entity Types

The following entity IDs are automatically extracted when present in tool interactions:

- **lead_id** - From lead-related tools (get_lead_details, update_lead, etc.)
- **contact_id** - From contact-related tools
- **account_id** - From account-related tools
- **opportunity_id** - From opportunity-related tools
- **activity_id** - From activity-related tools

## Extraction Logic

Entity IDs are extracted from three sources:

### 1. Tool Arguments (Explicit)

```javascript
{
  name: 'get_lead_details',
  arguments: { lead_id: 'uuid-here' }  // ← Extracted directly
}
```

### 2. Tool Name Pattern + Generic ID

```javascript
{
  name: 'get_contact_details',  // ← "contact" in name
  arguments: { id: 'uuid-here' }  // ← Generic id becomes contact_id
}
```

### 3. Tool Result JSON

```javascript
{
  name: 'create_lead',
  arguments: { name: 'New Lead' },
  result_preview: '{"lead_id":"newly-created-uuid"}'  // ← Extracted from result
}
```

## Context Carry-Forward

Entity context **persists across conversation turns**:

1. User asks about Lead A → Assistant message gets `lead_id: A`
2. User asks "What should I do next?" → System scans history, finds `lead_id: A`
3. `req.entityContext` is populated with `{ lead_id: A }` for tool execution

This enables implicit references like:

- "Tell me about this lead" (referring to previously mentioned lead)
- "What's their email?" (system knows which entity "their" refers to)

## Query Examples

### Find All Messages About a Specific Lead

```sql
SELECT * FROM conversation_messages
WHERE metadata @> '{"lead_id": "a3af0a84-a16f-466e-aa82-62b462d1d998"}';
```

### Find Conversations That Mentioned Any Lead

```sql
SELECT DISTINCT conversation_id
FROM conversation_messages
WHERE metadata ? 'lead_id';
```

### Count Messages by Entity Type

```sql
SELECT
  COUNT(CASE WHEN metadata ? 'lead_id' THEN 1 END) as lead_messages,
  COUNT(CASE WHEN metadata ? 'contact_id' THEN 1 END) as contact_messages,
  COUNT(CASE WHEN metadata ? 'account_id' THEN 1 END) as account_messages
FROM conversation_messages;
```

### Show Related Conversations on Entity Detail Page

```sql
-- Get recent conversations about this lead
SELECT
  c.id,
  c.agent_name,
  c.created_date,
  COUNT(cm.id) as message_count
FROM conversations c
JOIN conversation_messages cm ON cm.conversation_id = c.id
WHERE cm.metadata @> '{"lead_id": "a3af0a84-a16f-466e-aa82-62b462d1d998"}'
GROUP BY c.id, c.agent_name, c.created_date
ORDER BY c.created_date DESC
LIMIT 5;
```

### Track Which Leads Have Active AI Conversations

```sql
-- Find leads with at least one AI conversation
SELECT DISTINCT
  l.id,
  l.name,
  l.status,
  COUNT(DISTINCT cm.conversation_id) as conversation_count
FROM leads l
JOIN conversation_messages cm ON cm.metadata->>'lead_id' = l.id::text
WHERE cm.created_date > NOW() - INTERVAL '30 days'
GROUP BY l.id, l.name, l.status
ORDER BY conversation_count DESC;
```

### Build Analytics on AI Usage Per Entity Type

```sql
-- AI usage by entity type over last 7 days
SELECT
  DATE(cm.created_date) as date,
  COUNT(CASE WHEN metadata ? 'lead_id' THEN 1 END) as lead_conversations,
  COUNT(CASE WHEN metadata ? 'contact_id' THEN 1 END) as contact_conversations,
  COUNT(CASE WHEN metadata ? 'account_id' THEN 1 END) as account_conversations,
  COUNT(CASE WHEN metadata ? 'opportunity_id' THEN 1 END) as opportunity_conversations
FROM conversation_messages cm
WHERE cm.created_date > NOW() - INTERVAL '7 days'
  AND cm.role = 'assistant'
GROUP BY DATE(cm.created_date)
ORDER BY date DESC;
```

## Implementation Details

### Backend Code Location

- **Helper Function**: `backend/routes/ai.js` - `extractEntityContext(toolInteractions)`
- **Metadata Updates**: `backend/routes/ai.js` - Three `insertAssistantMessage` call sites
- **Context Carry-Forward**: `backend/routes/ai.js` - Conversation history loading (~line 2000)

### Test Coverage

- **Unit Tests**: `backend/__tests__/ai/entityContextExtraction.test.js` (9 tests)
- **Integration Tests**: `backend/__tests__/ai/entityContextIntegration.test.js` (5 tests)

All 14 tests passing ✅

## Use Cases

### 1. Entity Detail Page - Related Conversations

Show "Recent AI Conversations" section on lead/contact/account detail pages.

### 2. Conversation Search/Filter

Filter conversations by entity type or specific entity ID in admin panel.

### 3. Context-Aware Suggestions

When user opens a conversation, pre-populate entity context for smart suggestions.

### 4. Analytics Dashboard

Show AI usage metrics broken down by entity type (leads vs contacts vs accounts).

### 5. Smart Routing

Route follow-up questions to appropriate tools based on carried-forward entity context.

## Performance Considerations

- **Index Recommendation**: Add GIN index on metadata column for fast JSONB queries:

  ```sql
  CREATE INDEX idx_conversation_messages_metadata_gin
  ON conversation_messages USING GIN (metadata jsonb_path_ops);
  ```

- **Null Values**: Only non-null entity IDs are included in metadata to avoid clutter

- **Query Performance**: `@>` operator with GIN index is very fast (sub-millisecond for typical datasets)

## Future Enhancements

Potential future improvements:

1. **Multi-Entity Support**: Track multiple entities of same type in single message (e.g., comparing two leads)
2. **Entity Hierarchy**: Track parent-child relationships (account → opportunities → activities)
3. **Entity Metadata**: Store entity name/status alongside ID for display without extra query
4. **Context TTL**: Expire carried-forward context after N turns or time period
5. **Smart Context Merge**: Merge multiple entity contexts instead of just using most recent

## Migration Guide

No migration required! This feature works with existing data:

- **New messages**: Automatically get entity IDs extracted
- **Old messages**: Still queryable, just won't have top-level entity IDs (tool_interactions still intact)
- **Backward compatible**: Existing queries continue to work unchanged

## Troubleshooting

### Entity ID Not Being Extracted

Check if:

1. Tool name follows expected patterns (get_lead_details, update_contact, etc.)
2. Tool arguments include explicit `{entity_type}_id` field
3. Tool result JSON is valid and contains entity ID fields
4. Tool is not a list/search operation (these are excluded)

### Context Not Carrying Forward

Verify:

1. Conversation history query includes `metadata` column
2. Previous messages have entity IDs in metadata
3. `req.entityContext` is populated (check logs for "Carried forward entity context")

### Query Performance Issues

Solutions:

1. Add GIN index on metadata column (see Performance Considerations above)
2. Use `@>` operator instead of `->` for better index usage
3. Limit query to recent messages (add `created_date` filter)
