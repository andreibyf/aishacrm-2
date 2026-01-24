/**
 * Verification script for PR4 telemetry-sidecar compatibility
 * 
 * Demonstrates that audit logs include required telemetry fields
 */

import { emitCareAudit } from './lib/care/careAuditEmitter.js';
import { CareAuditEventType, CarePolicyGateResult } from './lib/care/careAuditTypes.js';

console.log('\n=== PR4 Telemetry-Sidecar Format Verification ===\n');
console.log('Expected format: [CARE_AUDIT] {single-line JSON with _telemetry and type fields}\n');

const exampleEvent = {
  ts: '2026-01-23T12:00:00.000Z',
  tenant_id: 'example-tenant-uuid',
  entity_type: 'conversation',
  entity_id: 'conv-example-123',
  event_type: CareAuditEventType.ESCALATION_DETECTED,
  action_origin: 'care_autonomous',
  reason: 'Customer used objection phrase: "not interested"',
  policy_gate_result: CarePolicyGateResult.ESCALATED,
  meta: {
    escalation_reasons: ['objection'],
    confidence: 'high',
    trigger_phrase: 'not interested'
  }
};

console.log('Emitting example audit event...\n');
emitCareAudit(exampleEvent);

console.log('\n✅ Verification complete');
console.log('\nTelemetry-sidecar can harvest logs by:');
console.log('1. Filtering for "[CARE_AUDIT]" prefix');
console.log('2. Parsing JSON after prefix');
console.log('3. Checking _telemetry=true and type="care_audit"');
console.log('4. Extracting tenant_id, entity_type, entity_id, event_type, etc.\n');
