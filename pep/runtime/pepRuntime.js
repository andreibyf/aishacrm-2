/**
 * PEP Runtime — Thin adapter between PEP compiled programs and the Braid execution engine
 *
 * This is the ONLY file in pep/ that touches backend infrastructure.
 * It takes a compiled PEP program and executes it via the existing Braid execution engine
 * under the existing policy and sandbox guarantees.
 *
 * The runtime NEVER calls the LLM. Execution is fully deterministic from the IR.
 * Tenant isolation is enforced by the existing Braid policy layer automatically.
 *
 * Usage:
 *   import { executePepProgram, validateCompiledProgram } from './pepRuntime.js';
 *
 *   const validation = validateCompiledProgram(compiled);
 *   if (validation.valid) {
 *     const result = await executePepProgram(compiled, { tenant_id, actor, policy });
 *   }
 */

'use strict';

// Import from existing Braid execution engine — do not copy or reimplement
import { executeBraidTool, TOOL_ACCESS_TOKEN } from '../../backend/lib/braid/execution.js';

/**
 * Validate a compiled PEP program has the correct shape and required fields.
 *
 * @param {object} compiledProgram - Output of compile() from pep/compiler/index.js
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCompiledProgram(compiledProgram) {
  const errors = [];

  if (!compiledProgram || typeof compiledProgram !== 'object') {
    return { valid: false, errors: ['compiledProgram must be a non-null object'] };
  }

  if (compiledProgram.status !== 'compiled') {
    errors.push(`Expected status "compiled", got "${compiledProgram.status}"`);
  }

  // Check required top-level fields
  const requiredFields = ['semantic_frame', 'braid_ir', 'plan', 'audit'];
  for (const field of requiredFields) {
    if (!compiledProgram[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate braid_ir structure
  if (compiledProgram.braid_ir) {
    const ir = compiledProgram.braid_ir;
    if (!ir.version) {
      errors.push('braid_ir missing version');
    }
    if (!ir.program_id) {
      errors.push('braid_ir missing program_id');
    }
    if (!Array.isArray(ir.instructions) || ir.instructions.length === 0) {
      errors.push('braid_ir must have at least one instruction');
    }
    if (ir.instructions) {
      for (let i = 0; i < ir.instructions.length; i++) {
        const instr = ir.instructions[i];
        if (!instr.op) {
          errors.push(`braid_ir instruction ${i} missing op field`);
        }
      }
    }
  }

  // Validate plan structure
  if (compiledProgram.plan) {
    if (!Array.isArray(compiledProgram.plan.steps)) {
      errors.push('plan must have a steps array');
    }
  }

  // Validate audit structure
  if (compiledProgram.audit) {
    if (!compiledProgram.audit.risk_flags) {
      errors.push('audit missing risk_flags');
    }
    if (!compiledProgram.audit.cost_estimate) {
      errors.push('audit missing cost_estimate');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Execute a compiled PEP program via the Braid runtime.
 *
 * @param {object} compiledProgram - Output of compile() with status === "compiled"
 * @param {object} runtimeContext - Runtime context
 * @param {string} runtimeContext.tenant_id - UUID of the tenant
 * @param {string} runtimeContext.actor - User or system actor executing the program
 * @param {string} [runtimeContext.policy] - Override policy (defaults to IR policy)
 * @returns {Promise<{ success: boolean, result: object, audit_trail: object[] }>}
 */
export async function executePepProgram(compiledProgram, runtimeContext) {
  // Validate program before execution
  const validation = validateCompiledProgram(compiledProgram);
  if (!validation.valid) {
    return {
      success: false,
      result: null,
      audit_trail: [
        {
          step: 'validation',
          status: 'failed',
          errors: validation.errors,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  const { tenant_id, actor, policy: _policy } = runtimeContext;
  const ir = compiledProgram.braid_ir;
  const auditTrail = [];

  // Build a mock tenant record for the Braid execution engine
  const tenantRecord = { id: tenant_id, tenant_id };

  try {
    // Execute each instruction in the IR sequentially
    const results = {};

    for (const instruction of ir.instructions) {
      const stepAudit = {
        step: instruction.op,
        assign: instruction.assign,
        timestamp: new Date().toISOString(),
      };

      try {
        switch (instruction.op) {
          case 'load_entity': {
            // Load entity is resolved from context — placeholder for trigger data
            results[instruction.assign] = { _entity: instruction.entity, _loaded: true };
            stepAudit.status = 'ok';
            break;
          }

          case 'check_condition': {
            // Evaluate condition against loaded data
            const source = results[instruction.field?.split('.')[0]];
            const fieldName = instruction.field?.split('.').slice(1).join('.');
            const value = source ? source[fieldName] : undefined;
            results[instruction.assign] = value === instruction.value;
            stepAudit.status = results[instruction.assign] ? 'ok' : 'condition_false';
            break;
          }

          case 'call_capability': {
            // Map to Braid tool execution
            const toolName = resolveToolName(instruction, compiledProgram.semantic_frame);
            if (toolName) {
              const args = buildToolArgs(instruction, results, tenant_id);
              const toolResult = await executeBraidTool(
                toolName,
                args,
                tenantRecord,
                actor,
                TOOL_ACCESS_TOKEN,
              );
              results[instruction.assign] = toolResult;
              stepAudit.status = toolResult?.tag === 'Err' ? 'err' : 'ok';
              stepAudit.tool = toolName;
            } else {
              results[instruction.assign] = { tag: 'Ok', value: null };
              stepAudit.status = 'ok';
              stepAudit.note = 'capability resolved internally';
            }
            break;
          }

          case 'match': {
            // Pattern match on previous result
            const input = results[instruction.input];
            const tag = input?.tag || (input ? 'Ok' : 'Err');
            const matchedArm = instruction.arms?.find((a) => a.pattern === tag);

            if (matchedArm) {
              results[matchedArm.assign] = input;
              stepAudit.matched = matchedArm.pattern;

              // Execute nested instructions in the matched arm
              for (const nestedInstr of matchedArm.instructions || []) {
                const nestedToolName = resolveToolName(nestedInstr, compiledProgram.semantic_frame);
                if (nestedToolName) {
                  const nestedArgs = buildToolArgs(nestedInstr, results, tenant_id);
                  const nestedResult = await executeBraidTool(
                    nestedToolName,
                    nestedArgs,
                    tenantRecord,
                    actor,
                    TOOL_ACCESS_TOKEN,
                  );
                  results[nestedInstr.assign] = nestedResult;
                }
              }
              stepAudit.status = 'ok';
            } else {
              stepAudit.status = 'no_match';
            }
            break;
          }

          default:
            stepAudit.status = 'unknown_op';
        }
      } catch (err) {
        stepAudit.status = 'error';
        stepAudit.error = err.message;
      }

      auditTrail.push(stepAudit);
    }

    return {
      success: true,
      result: results,
      audit_trail: auditTrail,
    };
  } catch (err) {
    return {
      success: false,
      result: null,
      audit_trail: [
        ...auditTrail,
        {
          step: 'runtime',
          status: 'error',
          error: err.message,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}

/**
 * Resolve a Braid tool name from an IR instruction.
 * @param {object} instruction
 * @param {object} semanticFrame
 * @returns {string|null}
 */
function resolveToolName(instruction, _semanticFrame) {
  if (instruction.capability === 'persist_entity' && instruction.operation === 'create') {
    return 'createCashFlowTransaction';
  }
  if (instruction.capability === 'persist_entity' && instruction.operation === 'update') {
    return 'updateCashFlowTransaction';
  }
  if (instruction.capability === 'notify_role') {
    return 'notifyOwner';
  }
  if (instruction.capability === 'compute_next_date') {
    return null; // Resolved internally, no external tool
  }
  return null;
}

/**
 * Build tool arguments from IR instruction and resolved results.
 * @param {object} instruction
 * @param {object} results
 * @param {string} tenantId
 * @returns {object}
 */
function buildToolArgs(instruction, results, tenantId) {
  const args = { tenant_id: tenantId };

  if (instruction.derive_from && results[instruction.derive_from]) {
    Object.assign(args, results[instruction.derive_from]);
  }

  if (instruction.overrides) {
    for (const [key, val] of Object.entries(instruction.overrides)) {
      args[key] = typeof val === 'string' && val.startsWith('__') ? results[val] || val : val;
    }
  }

  if (instruction.message) {
    args.message = instruction.message;
  }

  if (instruction.target) {
    args.target = instruction.target;
  }

  return args;
}
