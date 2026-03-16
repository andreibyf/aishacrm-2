import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

let server;
const port = 3114;
const generateScheduledAiEmailDraftCalls = [];
let getAccessLevelResult = 'full';

function requestWithBody(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: {
          connection: 'close',
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          res.status = res.statusCode;
          res.json = () => JSON.parse(raw);
          resolve(res);
        });
      },
    );
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

describe('Activities scheduled AI email route', () => {
  before(async () => {
    const express = (await import('express')).default;
    const createActivityV2Routes = (await import('../../routes/activities.v2.js')).default;

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = {
        id: 'user-1',
        email: 'owner@example.com',
        role: 'admin',
        tenant_id: 'tenant-1',
        tenant_uuid: 'tenant-1',
      };
      req.tenant = { id: 'tenant-1' };
      next();
    });

    app.use(
      '/api/v2/activities',
      createActivityV2Routes(null, {
        getSupabaseClient: () => ({
          from(table) {
            assert.equal(table, 'activities');
            return {
              select() {
                return this;
              },
              eq() {
                return this;
              },
              async maybeSingle() {
                return {
                  data: {
                    id: 'activity-001',
                    assigned_to: 'user-1',
                    assigned_to_team: 'team-1',
                  },
                  error: null,
                };
              },
            };
          },
        }),
        getVisibilityScope: async () => ({ mode: 'self', employeeIds: ['user-1'] }),
        getAccessLevel: () => getAccessLevelResult,
        generateScheduledAiEmailDraft: async (args) => {
          generateScheduledAiEmailDraftCalls.push(args);
          return {
            activity: {
              id: args.activityId,
              tenant_id: args.tenantId,
              type: 'scheduled_ai_email',
              metadata: {
                ai_email_generation: {
                  status: 'pending_approval',
                  suggestion_id: 'suggestion-001',
                },
              },
            },
            generation_result: {
              status: 'pending_approval',
              suggestion_id: 'suggestion-001',
            },
          };
        },
      }),
    );

    server = app.listen(port);
    await new Promise((resolve) => server.once('listening', resolve));
  });

  after(async () => {
    generateScheduledAiEmailDraftCalls.length = 0;
    getAccessLevelResult = 'full';
    if (server) {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('POST /:id/generate-ai-email invokes the scheduled draft service', async () => {
    const res = await requestWithBody('POST', '/api/v2/activities/activity-001/generate-ai-email', {
      tenant_id: 'tenant-1',
    });

    assert.equal(res.status, 200);
    const body = res.json();
    assert.equal(body.status, 'success');
    assert.equal(generateScheduledAiEmailDraftCalls.length, 1);
    assert.equal(generateScheduledAiEmailDraftCalls[0].tenantId, 'tenant-1');
    assert.equal(generateScheduledAiEmailDraftCalls[0].activityId, 'activity-001');
  });

  it('POST /:id/generate-ai-email falls back to the authenticated tenant context', async () => {
    const res = await requestWithBody('POST', '/api/v2/activities/activity-001/generate-ai-email');

    assert.equal(res.status, 200);
    const body = res.json();
    assert.equal(body.status, 'success');
    assert.equal(generateScheduledAiEmailDraftCalls.at(-1).tenantId, 'tenant-1');
  });

  it('POST /:id/generate-ai-email rejects users without full access', async () => {
    getAccessLevelResult = 'none';

    const res = await requestWithBody('POST', '/api/v2/activities/activity-001/generate-ai-email', {
      tenant_id: 'tenant-1',
    });

    assert.equal(res.status, 403);
    const body = res.json();
    assert.equal(body.status, 'error');
    assert.equal(
      body.message,
      'You do not have permission to generate AI email drafts for this record',
    );
  });

  it('POST /:id/generate-ai-email rejects read-notes access', async () => {
    getAccessLevelResult = 'read_notes';

    const res = await requestWithBody('POST', '/api/v2/activities/activity-001/generate-ai-email', {
      tenant_id: 'tenant-1',
    });

    assert.equal(res.status, 403);
    const body = res.json();
    assert.equal(body.status, 'error');
    assert.equal(
      body.message,
      'You do not have permission to generate AI email drafts for this record',
    );
  });
});
