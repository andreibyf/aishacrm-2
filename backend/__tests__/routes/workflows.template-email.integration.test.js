import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';
import { TENANT_ID } from '../testConstants.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:4001';
const SHOULD_RUN =
  process.env.RUN_TEMPLATE_WORKFLOW_INTEGRATION === 'true' ||
  (process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : false);
const TEST_PREFIX = '[TEST-AUTO][TEMPLATE-WF]';

async function jsonFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

function extractActivitiesList(json) {
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.data?.activities)) return json.data.activities;
  if (Array.isArray(json?.activities)) return json.activities;
  return [];
}

async function createTemplate(name) {
  const payload = {
    tenant_id: TENANT_ID,
    name,
    type: 'email',
    template_json: {
      type: 'email',
      version: 1,
      blocks: [
        { type: 'text', content: 'Hi {{contact_name}},' },
        { type: 'text', content: 'Company: {{company}}' },
        { type: 'button', text: 'Book a Call', url: '{{booking_link}}' },
      ],
    },
    is_active: true,
  };

  const { res, json } = await jsonFetch('/api/v2/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return { status: res.status, json };
}

async function createWorkflow(name, templateId) {
  const payload = {
    tenant_id: TENANT_ID,
    name,
    description: `${TEST_PREFIX} workflow for template_id email rendering`,
    trigger_type: 'manual',
    status: 'draft',
    is_test_data: true,
    nodes: [
      { id: 'trigger-1', type: 'manual_trigger', config: {}, position: { x: 200, y: 120 } },
      {
        id: 'email-1',
        type: 'send_email',
        config: {
          to: 'qa-template-test@example.com',
          subject: `${TEST_PREFIX} Subject`,
          template_id: templateId,
          template_variables: {
            contact_name: '{{contact_name}}',
            company: '{{company}}',
            booking_link: '{{booking_link}}',
          },
        },
        position: { x: 200, y: 260 },
      },
    ],
    connections: [{ from: 'trigger-1', to: 'email-1' }],
  };

  const { res, json } = await jsonFetch('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return { status: res.status, json };
}

async function deleteWorkflow(id) {
  await jsonFetch(`/api/workflows/${id}?tenant_id=${TENANT_ID}`, { method: 'DELETE' });
}

async function softDeleteTemplate(id) {
  await jsonFetch(`/api/v2/templates/${id}?tenant_id=${TENANT_ID}`, { method: 'DELETE' });
}

async function findQueuedEmailActivity(workflowId, subject) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { res, json } = await jsonFetch(
      `/api/v2/activities?tenant_id=${TENANT_ID}&type=email&limit=50`,
      { method: 'GET' },
    );

    if (res.status === 200) {
      const rows = extractActivitiesList(json);
      const match = rows.find((row) => {
        const createdByWorkflow = row?.metadata?.created_by_workflow;
        return createdByWorkflow === workflowId && row?.subject === subject;
      });
      if (match) return match;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

(SHOULD_RUN ? test : test.skip)(
  'workflow send_email with template_id renders template HTML into queued activity body',
  async (t) => {
    const authHeaders = getAuthHeaders();
    if (!authHeaders.Authorization || !authHeaders.apikey) {
      t.skip('Missing SUPABASE service/anon key environment for authenticated integration test');
      return;
    }

    const suffix = Date.now();
    const templateName = `${TEST_PREFIX} Template ${suffix}`;
    const workflowName = `${TEST_PREFIX} Workflow ${suffix}`;

    let createdTemplateId = null;
    let createdWorkflowId = null;

    try {
      const templateResult = await createTemplate(templateName);
      assert.equal(
        templateResult.status,
        201,
        `Template create failed: ${templateResult.status} ${JSON.stringify(templateResult.json)}`,
      );
      createdTemplateId = templateResult.json?.data?.id;
      assert.ok(createdTemplateId, 'Expected template id');

      const workflowResult = await createWorkflow(workflowName, createdTemplateId);
      assert.equal(
        workflowResult.status,
        201,
        `Workflow create failed: ${workflowResult.status} ${JSON.stringify(workflowResult.json)}`,
      );
      createdWorkflowId = workflowResult.json?.data?.id || workflowResult.json?.data?.workflow?.id;
      assert.ok(createdWorkflowId, 'Expected workflow id');

      const executeResult = await jsonFetch('/api/workflows/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflow_id: createdWorkflowId,
          tenant_id: TENANT_ID,
          contact_name: 'Ari',
          company: 'AiSHA CRM',
          booking_link: 'https://example.com/book/ari',
        }),
      });

      assert.ok(
        [200, 201].includes(executeResult.res.status),
        `Workflow execute failed: ${executeResult.res.status} ${JSON.stringify(executeResult.json)}`,
      );

      const subject = `${TEST_PREFIX} Subject`;
      const activity = await findQueuedEmailActivity(createdWorkflowId, subject);
      assert.ok(activity, 'Expected queued email activity created by workflow');
      assert.equal(activity.type, 'email');
      assert.equal(activity.subject, subject);
      assert.equal(activity.status, 'queued');
      assert.match(String(activity.body || ''), /Hi Ari,/);
      assert.match(String(activity.body || ''), /Company: AiSHA CRM/);
      assert.match(String(activity.body || ''), /https:\/\/example.com\/book\/ari/);
      assert.match(String(activity.body || ''), /<a href=/);
      assert.equal(activity.metadata?.email?.template_id, createdTemplateId);
    } finally {
      if (createdWorkflowId) {
        await deleteWorkflow(createdWorkflowId);
      }
      if (createdTemplateId) {
        await softDeleteTemplate(createdTemplateId);
      }
    }
  },
);
