/**
 * Seed Demo Workflow
 * Creates a demonstration workflow showcasing Zapier-like automation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const demoMetadata = {
  nodes: [
    {
      id: 'node-1',
      type: 'webhook_trigger',
      config: { description: 'Receives lead data via webhook' }
    },
    {
      id: 'node-2',
      type: 'find_lead',
      config: {
        email: '{{email}}',
        description: 'Check if lead already exists'
      }
    },
    {
      id: 'node-3',
      type: 'condition',
      config: {
        field: 'found_lead',
        operator: 'exists',
        value: 'true',
        description: 'Branch based on whether lead exists'
      }
    },
    {
      id: 'node-4',
      type: 'create_lead',
      config: {
        email: '{{email}}',
        first_name: '{{first_name}}',
        last_name: '{{last_name}}',
        company: '{{company}}',
        status: 'new',
        source: 'webhook',
        description: 'Create new lead if not found'
      }
    },
    {
      id: 'node-5',
      type: 'http_request',
      config: {
        method: 'POST',
        url: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK',
        headers: [
          { key: 'Content-Type', value: 'application/json' }
        ],
        body_type: 'raw',
        body_raw: JSON.stringify({
          text: 'New Lead Created!',
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '*New Lead Alert* 🎯' }
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: '*Name:*\n{{first_name}} {{last_name}}' },
                { type: 'mrkdwn', text: '*Email:*\n{{email}}' },
                { type: 'mrkdwn', text: '*Company:*\n{{company}}' }
              ]
            }
          ]
        }, null, 2),
        description: 'Send Slack notification for new lead'
      }
    },
    {
      id: 'node-6',
      type: 'update_lead',
      config: {
        lead_id: '{{found_lead.id}}',
        last_contacted: 'NOW()',
        notes: 'Duplicate submission received via webhook',
        description: 'Update existing lead with timestamp'
      }
    }
  ],
  connections: [
    { from: 'node-1', to: 'node-2' },
    { from: 'node-2', to: 'node-3' },
    { from: 'node-3', to: 'node-4', type: 'FALSE' },
    { from: 'node-3', to: 'node-6', type: 'TRUE' },
    { from: 'node-4', to: 'node-5' }
  ],
  execution_count: 0
};

async function seedDemoWorkflow() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    console.log('🔧 Seeding Demo Workflow...');

    // Get first active tenant
    const { data: tenants, error: tenantErr } = await supabase
      .from('tenant')
      .select('id, tenant_id')
      .order('created_at')
      .limit(1);

    if (tenantErr) throw tenantErr;
    if (!tenants || tenants.length === 0) {
      console.error('❌ No active tenant found. Please create a tenant first.');
      process.exit(1);
    }

    const tenant = tenants[0];
    const tenantId = tenant.tenant_id || tenant.id;
    console.log(`✓ Using tenant: ${tenantId}`);

    // Check if Demo workflow already exists
    const { data: existing, error: existingErr } = await supabase
      .from('workflow')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('name', 'Demo')
      .limit(1);

    if (existingErr && existingErr.code !== 'PGRST116') throw existingErr;

    if (existing && existing.length > 0) {
      console.log('ℹ Demo workflow already exists. Updating...');
      const workflowId = existing[0].id;
      
      // Update metadata with webhook_url
      const updatedMetadata = {
        ...demoMetadata,
        webhook_url: `/api/workflows/${workflowId}/webhook`
      };

      // Update existing workflow
      const { error: updateErr } = await supabase
        .from('workflow')
        .update({
          description: 'Demo workflow showcasing lead capture → condition check → Slack notification',
          trigger_type: 'webhook',
          trigger_config: { method: 'POST', auth_required: false },
          is_active: true,
          metadata: updatedMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', workflowId);

      if (updateErr) throw updateErr;

      console.log(`✅ Demo workflow updated: ${workflowId}`);
      console.log(`\n🔗 Webhook URL: http://localhost:4001/api/workflows/${workflowId}/webhook`);
      console.log('\n📋 Test with:');
      console.log(`curl -X POST http://localhost:4001/api/workflows/${workflowId}/webhook \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"email":"test@example.com","first_name":"John","last_name":"Doe","company":"Acme Corp"}'`);
    } else {
      // Create new workflow first to get ID
      const { data: newWorkflow, error: createErr } = await supabase
        .from('workflow')
        .insert({
          tenant_id: tenantId,
          name: 'Demo',
          description: 'Demo workflow showcasing lead capture → condition check → Slack notification',
          trigger_type: 'webhook',
          trigger_config: { method: 'POST', auth_required: false },
          is_active: true,
          metadata: demoMetadata,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createErr) throw createErr;

      const workflowId = newWorkflow.id;

      // Update metadata with webhook_url now that we have the ID
      const updatedMetadata = {
        ...demoMetadata,
        webhook_url: `/api/workflows/${workflowId}/webhook`
      };

      const { error: updateErr } = await supabase
        .from('workflow')
        .update({ metadata: updatedMetadata })
        .eq('id', workflowId);

      if (updateErr) throw updateErr;

      console.log(`✅ Demo workflow created: ${workflowId}`);
      console.log(`\n🔗 Webhook URL: http://localhost:4001/api/workflows/${workflowId}/webhook`);
      console.log('\n📋 Test with:');
      console.log(`curl -X POST http://localhost:4001/api/workflows/${workflowId}/webhook \\`);
      console.log(`  -H "Content-Type: application/json" \\`);
      console.log(`  -d '{"email":"test@example.com","first_name":"John","last_name":"Doe","company":"Acme Corp"}'`);
    }

    console.log('\n💡 Flow: Webhook → Find Lead → Condition → [New: Create + Slack | Existing: Update]');
    console.log('💡 Replace Slack webhook URL in the UI to receive real notifications');

  } catch (error) {
    console.error('❌ Error seeding demo workflow:', error);
    process.exit(1);
  }
}

seedDemoWorkflow();

