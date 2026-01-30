/**
 * Braid Chains Module
 * Multi-step tool workflows that can be executed atomically
 */

import { TOOL_REGISTRY } from './registry.js';
import { executeBraidTool } from './execution.js';

/**
 * Predefined Tool Chains - Multi-step workflows that can be executed atomically
 * Each chain defines:
 * - steps: Array of tool calls with argument mapping
 * - rollback: Optional steps to undo on failure
 * - required_role: Minimum role to execute this chain
 * - policy: Overall policy (uses most restrictive from steps)
 */
export const TOOL_CHAINS = {
  // Lead to Opportunity conversion workflow
  lead_to_opportunity: {
    name: 'Lead to Opportunity',
    description: 'Qualify a lead, convert to account, and create opportunity',
    required_role: 'user',
    policy: 'WRITE_OPERATIONS',
    steps: [
      {
        id: 'qualify',
        tool: 'qualify_lead',
        args: (input, _ctx) => ({
          lead_id: input.lead_id,
          notes: input.qualification_notes || 'Auto-qualified via chain'
        }),
        required: true
      },
      {
        id: 'convert',
        tool: 'convert_lead_to_account',
        args: (input, ctx) => ({
          lead_id: input.lead_id,
          options: {
            create_opportunity: false, // We'll create it manually with more control
            account_name: ctx.qualify?.value?.lead?.company || input.company_name
          }
        }),
        required: true,
        condition: (ctx) => ctx.qualify?.tag === 'Ok'
      },
      {
        id: 'opportunity',
        tool: 'create_opportunity',
        args: (input, ctx) => ({
          account_id: ctx.convert?.value?.account?.id,
          name: input.opportunity_name || `${ctx.convert?.value?.account?.name || 'New'} Opportunity`,
          amount: input.amount || 0,
          stage: input.stage || 'qualification',
          close_date: input.close_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          probability: input.probability || 25
        }),
        required: false, // Optional step
        condition: (ctx) => ctx.convert?.tag === 'Ok' && ctx.convert?.value?.account?.id
      }
    ],
    rollback: [
      // Rollback opportunity if created
      { tool: 'delete_opportunity', args: (ctx) => ({ opportunity_id: ctx.opportunity?.value?.id, confirmed: true }), condition: (ctx) => ctx.opportunity?.tag === 'Ok' },
      // Note: We don't rollback account conversion as it's a significant business event
    ]
  },

  // Account setup with primary contact
  account_with_contact: {
    name: 'Account with Contact',
    description: 'Create an account and add a primary contact',
    required_role: 'user',
    policy: 'WRITE_OPERATIONS',
    steps: [
      {
        id: 'account',
        tool: 'create_account',
        args: (input, _ctx) => ({
          name: input.account_name || input.company_name,
          industry: input.industry,
          website: input.website,
          email: input.company_email,
          phone: input.company_phone,
          annual_revenue: input.annual_revenue
        }),
        required: true
      },
      {
        id: 'contact',
        tool: 'create_contact',
        args: (input, ctx) => ({
          account_id: ctx.account?.value?.id,
          first_name: input.contact_first_name,
          last_name: input.contact_last_name,
          email: input.contact_email,
          phone: input.contact_phone,
          title: input.contact_title || 'Primary Contact',
          is_primary: true
        }),
        required: false,
        condition: (ctx) => ctx.account?.tag === 'Ok' && (input.contact_first_name || input.contact_email)
      }
    ],
    rollback: [
      { tool: 'delete_contact', args: (ctx) => ({ contact_id: ctx.contact?.value?.id, confirmed: true }), condition: (ctx) => ctx.contact?.tag === 'Ok' },
      { tool: 'delete_account', args: (ctx) => ({ account_id: ctx.account?.value?.id, confirmed: true }), condition: (ctx) => ctx.account?.tag === 'Ok' }
    ]
  },

  // Schedule activity after opportunity creation
  opportunity_with_followup: {
    name: 'Opportunity with Follow-up',
    description: 'Create an opportunity and schedule a follow-up activity',
    required_role: 'user',
    policy: 'WRITE_OPERATIONS',
    steps: [
      {
        id: 'opportunity',
        tool: 'create_opportunity',
        args: (input, _ctx) => ({
          account_id: input.account_id,
          name: input.opportunity_name,
          amount: input.amount,
          stage: input.stage || 'qualification',
          close_date: input.close_date,
          probability: input.probability
        }),
        required: true
      },
      {
        id: 'followup',
        tool: 'create_activity',
        args: (input, ctx) => ({
          subject: input.followup_subject || `Follow-up: ${ctx.opportunity?.value?.name}`,
          activity_type: input.activity_type || 'call',
          due_date: input.followup_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          assigned_to: input.assigned_to,
          entity_type: 'opportunity',
          entity_id: ctx.opportunity?.value?.id,
          body: input.followup_notes || 'Initial follow-up call'
        }),
        required: false,
        condition: (ctx) => ctx.opportunity?.tag === 'Ok'
      }
    ]
  },

  // Bulk lead qualification
  bulk_qualify_leads: {
    name: 'Bulk Qualify Leads',
    description: 'Qualify multiple leads at once',
    required_role: 'admin',
    policy: 'ADMIN_ONLY',
    dynamic: true, // Steps are generated from input array
    generateSteps: (input) => {
      if (!Array.isArray(input.lead_ids) || input.lead_ids.length === 0) {
        return [];
      }
      return input.lead_ids.map((leadId, index) => ({
        id: `qualify_${index}`,
        tool: 'qualify_lead',
        args: () => ({
          lead_id: leadId,
          notes: input.notes || 'Bulk qualification'
        }),
        required: false // Allow partial success
      }));
    }
  },

  // Research and enrich account
  research_account: {
    name: 'Research and Enrich Account',
    description: 'Look up company info and update account with findings',
    required_role: 'user',
    policy: 'WRITE_OPERATIONS',
    steps: [
      {
        id: 'get_account',
        tool: 'get_account_details',
        args: (input, _ctx) => ({
          account_id: input.account_id
        }),
        required: true
      },
      {
        id: 'research',
        tool: 'lookup_company_info',
        args: (input, ctx) => ({
          company_name: ctx.get_account?.value?.name,
          domain: ctx.get_account?.value?.website
        }),
        required: false,
        condition: (ctx) => ctx.get_account?.tag === 'Ok'
      },
      {
        id: 'update',
        tool: 'update_account',
        args: (input, ctx) => ({
          account_id: input.account_id,
          updates: {
            industry: ctx.research?.value?.industry || ctx.get_account?.value?.industry,
            annual_revenue: ctx.research?.value?.revenue || ctx.get_account?.value?.annual_revenue,
            website: ctx.research?.value?.website || ctx.get_account?.value?.website,
            metadata: {
              ...(ctx.get_account?.value?.metadata || {}),
              last_enriched: new Date().toISOString(),
              enrichment_source: 'web_research'
            }
          }
        }),
        required: false,
        condition: (ctx) => ctx.research?.tag === 'Ok' && ctx.research?.value
      }
    ]
  }
};

/**
 * Execute a tool chain
 * @param {string} chainName - Name of the chain to execute
 * @param {Object} input - Input parameters for the chain
 * @param {Object} tenantRecord - Tenant record
 * @param {string} userId - User ID
 * @param {Object} accessToken - Access token with user info
 * @returns {Promise<Object>} Chain execution result
 */
export async function executeToolChain(chainName, input, tenantRecord, userId, accessToken) {
  console.log(`[Braid Chain] Starting chain: ${chainName}`, { input: JSON.stringify(input).substring(0, 200) });
  
  const validation = validateChain(chainName, input);
  if (!validation.valid) {
    return {
      tag: 'Err',
      error: {
        type: 'ChainValidationError',
        message: 'Chain validation failed',
        errors: validation.errors
      }
    };
  }

  const chain = validation.chain;
  const context = {};
  const results = {};
  const executionLog = [];
  let hasRolledBack = false;

  try {
    // Get steps (may be dynamic)
    const steps = chain.dynamic && chain.generateSteps 
      ? chain.generateSteps(input) 
      : chain.steps || [];

    if (steps.length === 0) {
      return {
        tag: 'Err',
        error: {
          type: 'EmptyChain',
          message: 'Chain has no steps to execute'
        }
      };
    }

    // Execute each step
    for (const [index, step] of steps.entries()) {
      console.log(`[Braid Chain] Step ${index + 1}/${steps.length}: ${step.id} (${step.tool})`);
      
      // Check if step should be executed (conditional logic)
      if (step.condition && !step.condition(context)) {
        console.log(`[Braid Chain] Skipping step ${step.id} - condition not met`);
        executionLog.push({
          step: step.id,
          tool: step.tool,
          status: 'skipped',
          reason: 'condition_not_met',
          timestamp: new Date().toISOString()
        });
        continue;
      }

      // Generate arguments for this step
      let stepArgs;
      try {
        stepArgs = typeof step.args === 'function' 
          ? step.args(input, context)
          : step.args;
      } catch (argError) {
        console.error(`[Braid Chain] Failed to generate args for step ${step.id}:`, argError);
        
        const errorResult = {
          tag: 'Err',
          error: {
            type: 'ArgumentGenerationError',
            message: `Failed to generate arguments for step ${step.id}: ${argError.message}`,
            step: step.id,
            tool: step.tool
          }
        };

        executionLog.push({
          step: step.id,
          tool: step.tool,
          status: 'error',
          error: errorResult.error,
          timestamp: new Date().toISOString()
        });

        // If step is required, fail the entire chain
        if (step.required) {
          await executeRollback(chain, context, tenantRecord, userId, accessToken);
          hasRolledBack = true;
          return {
            ...errorResult,
            context,
            executionLog,
            rolledBack: hasRolledBack
          };
        }
        
        // If step is optional, continue
        context[step.id] = errorResult;
        continue;
      }

      // Execute the tool
      const startTime = Date.now();
      const result = await executeBraidTool(step.tool, stepArgs, tenantRecord, userId, accessToken);
      const executionTime = Date.now() - startTime;

      // Store result in context for later steps
      context[step.id] = result;
      results[step.id] = result;

      const logEntry = {
        step: step.id,
        tool: step.tool,
        args: stepArgs,
        status: result.tag === 'Ok' ? 'success' : 'error',
        executionTime,
        timestamp: new Date().toISOString()
      };

      if (result.tag === 'Err') {
        logEntry.error = result.error;
        console.error(`[Braid Chain] Step ${step.id} failed:`, result.error);
        
        // If step is required, fail the entire chain
        if (step.required) {
          executionLog.push(logEntry);
          
          console.log('[Braid Chain] Required step failed, executing rollback');
          await executeRollback(chain, context, tenantRecord, userId, accessToken);
          hasRolledBack = true;
          
          return {
            tag: 'Err',
            error: {
              type: 'ChainStepFailed',
              message: `Required step '${step.id}' failed: ${result.error?.message || 'Unknown error'}`,
              failedStep: step.id,
              stepError: result.error
            },
            context,
            results,
            executionLog,
            rolledBack: hasRolledBack
          };
        }
        
        // If step is optional, log and continue
        console.warn(`[Braid Chain] Optional step ${step.id} failed, continuing chain`);
      } else {
        console.log(`[Braid Chain] Step ${step.id} completed successfully`);
      }

      executionLog.push(logEntry);
    }

    console.log(`[Braid Chain] Chain ${chainName} completed successfully`);
    
    return {
      tag: 'Ok',
      value: {
        chainName,
        input,
        context,
        results,
        executionLog,
        completedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error(`[Braid Chain] Chain ${chainName} threw exception:`, error);
    
    // Try to rollback on unexpected errors
    if (!hasRolledBack) {
      await executeRollback(chain, context, tenantRecord, userId, accessToken);
      hasRolledBack = true;
    }
    
    return {
      tag: 'Err',
      error: {
        type: 'ChainExecutionError',
        message: `Chain execution failed: ${error.message}`,
        stack: error.stack
      },
      context,
      results,
      executionLog,
      rolledBack: hasRolledBack
    };
  }
}

/**
 * Execute rollback steps for a chain
 * @private
 */
async function executeRollback(chain, context, tenantRecord, userId, accessToken) {
  if (!chain.rollback || chain.rollback.length === 0) {
    console.log('[Braid Chain] No rollback steps defined');
    return;
  }

  console.log(`[Braid Chain] Executing ${chain.rollback.length} rollback steps`);
  
  // Execute rollback steps in reverse order
  for (const [index, rollbackStep] of chain.rollback.reverse().entries()) {
    try {
      // Check if rollback step should be executed
      if (rollbackStep.condition && !rollbackStep.condition(context)) {
        console.log(`[Braid Chain] Skipping rollback step ${index} - condition not met`);
        continue;
      }

      // Generate arguments for rollback
      const rollbackArgs = typeof rollbackStep.args === 'function' 
        ? rollbackStep.args(context)
        : rollbackStep.args;

      console.log(`[Braid Chain] Rollback step ${index + 1}: ${rollbackStep.tool}`);
      
      // Execute rollback (don't fail chain if rollback fails - just log)
      const rollbackResult = await executeBraidTool(rollbackStep.tool, rollbackArgs, tenantRecord, userId, accessToken);
      
      if (rollbackResult.tag === 'Err') {
        console.error(`[Braid Chain] Rollback step ${rollbackStep.tool} failed:`, rollbackResult.error);
      } else {
        console.log(`[Braid Chain] Rollback step ${rollbackStep.tool} completed`);
      }
    } catch (rollbackError) {
      console.error(`[Braid Chain] Rollback step ${rollbackStep.tool} threw exception:`, rollbackError);
    }
  }
  
  console.log('[Braid Chain] Rollback completed');
}

/**
 * Validate a chain definition before execution
 * @param {string} chainName - Name of the chain
 * @param {Object} input - Input parameters
 * @returns {{ valid: boolean, errors: string[], chain: Object|null }}
 */
export function validateChain(chainName, input) {
  const errors = [];
  const chain = TOOL_CHAINS[chainName];

  if (!chain) {
    return { valid: false, errors: [`Chain '${chainName}' not found`], chain: null };
  }

  // Get steps (may be dynamic)
  const steps = chain.dynamic && chain.generateSteps 
    ? chain.generateSteps(input) 
    : chain.steps;

  if (!steps || steps.length === 0) {
    errors.push('Chain has no steps to execute');
  }

  // Validate each step's tool exists
  for (const step of steps || []) {
    if (!TOOL_REGISTRY[step.tool]) {
      errors.push(`Step '${step.id}': Tool '${step.tool}' not found in registry`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    chain,
    steps: steps || []
  };
}

/**
 * List available tool chains
 * @param {string} userRole - User role for filtering
 * @returns {Array} Available chains for the user
 */
export function listToolChains(userRole = 'user') {
  const availableChains = [];
  
  for (const [name, chain] of Object.entries(TOOL_CHAINS)) {
    // Check role requirements
    if (chain.required_role) {
      const roleHierarchy = {
        'user': 1,
        'manager': 2,
        'admin': 3,
        'superadmin': 4
      };
      
      const userLevel = roleHierarchy[userRole] || 0;
      const requiredLevel = roleHierarchy[chain.required_role] || 0;
      
      if (userLevel < requiredLevel) {
        continue;
      }
    }
    
    availableChains.push({
      name,
      displayName: chain.name,
      description: chain.description,
      policy: chain.policy,
      required_role: chain.required_role,
      isDynamic: chain.dynamic || false,
      stepCount: chain.dynamic ? 'variable' : (chain.steps?.length || 0),
      hasRollback: !!(chain.rollback && chain.rollback.length > 0)
    });
  }
  
  return availableChains;
}