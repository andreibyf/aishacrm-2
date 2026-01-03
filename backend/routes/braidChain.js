/**
 * Braid Tool Chaining API
 * REST endpoints for executing multi-step tool workflows
 */

import express from 'express';
import { executeChain, listChains, validateChain, TOOL_CHAINS, TOOL_ACCESS_TOKEN } from '../lib/braidIntegration-v2.js';
import logger from '../lib/logger.js';

const router = express.Router();

/**
 * GET /api/braid/chain
 * List available chains with metadata
 */
router.get('/', async (req, res) => {
  try {
    const userRole = req.user?.role || 'user';
    const chains = listChains(userRole);
    
    res.json({
      success: true,
      chains,
      count: chains.length
    });
  } catch (error) {
    logger.error('[Braid Chain API] List error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to list chains',
      message: error.message
    });
  }
});

/**
 * GET /api/braid/chain/:chainName
 * Get details about a specific chain
 */
router.get('/:chainName', async (req, res) => {
  try {
    const { chainName } = req.params;
    const chain = TOOL_CHAINS[chainName];
    
    if (!chain) {
      return res.status(404).json({
        success: false,
        error: 'ChainNotFound',
        message: `Chain '${chainName}' not found`
      });
    }

    // Build step details (without exposing internal functions)
    const steps = chain.dynamic 
      ? { dynamic: true, description: 'Steps generated from input' }
      : chain.steps?.map(s => ({
          id: s.id,
          tool: s.tool,
          required: s.required ?? true,
          hasCondition: !!s.condition
        }));

    res.json({
      success: true,
      chain: {
        name: chainName,
        displayName: chain.name,
        description: chain.description,
        requiredRole: chain.required_role,
        policy: chain.policy,
        steps,
        hasRollback: !!(chain.rollback && chain.rollback.length > 0)
      }
    });
  } catch (error) {
    logger.error('[Braid Chain API] Get chain error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get chain details',
      message: error.message
    });
  }
});

/**
 * POST /api/braid/chain/:chainName/validate
 * Validate a chain without executing it
 */
router.post('/:chainName/validate', async (req, res) => {
  try {
    const { chainName } = req.params;
    const input = req.body;
    
    const validation = validateChain(chainName, input);
    
    res.json({
      success: validation.valid,
      chainName,
      valid: validation.valid,
      errors: validation.errors,
      stepCount: validation.steps?.length || 0
    });
  } catch (error) {
    logger.error('[Braid Chain API] Validate error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Validation failed',
      message: error.message
    });
  }
});

/**
 * POST /api/braid/chain/:chainName/execute
 * Execute a chain
 * Body: { input: {...}, options: { dryRun: false, stopOnError: true } }
 */
router.post('/:chainName/execute', async (req, res) => {
  try {
    const { chainName } = req.params;
    const { input = {}, options = {} } = req.body;
    
    // Auth check
    if (!req.user || !req.tenant) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required to execute chains'
      });
    }

    // Build access token with user context
    const accessToken = {
      ...TOOL_ACCESS_TOKEN,
      user_role: req.user.role || 'user',
      user_id: req.user.id,
      tenant_id: req.tenant.id
    };

    logger.debug(`[Braid Chain API] Executing '${chainName}'`, {
      tenantId: req.tenant.id,
      userId: req.user.id,
      dryRun: options.dryRun || false
    });

    const result = await executeChain(
      chainName,
      input,
      req.tenant,
      req.user.id,
      accessToken,
      options
    );

    // Return appropriate status based on result
    if (result.tag === 'Err') {
      const status = result.error?.type === 'ChainValidationError' ? 400
        : result.error?.type === 'InsufficientPermissions' ? 403
        : 500;
      
      return res.status(status).json({
        success: false,
        ...result
      });
    }

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('[Braid Chain API] Execute error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      error: 'ChainExecutionError',
      message: error.message
    });
  }
});

/**
 * POST /api/braid/chain/:chainName/dry-run
 * Preview chain execution without making changes
 * Shorthand for execute with dryRun: true
 */
router.post('/:chainName/dry-run', async (req, res) => {
  try {
    const { chainName } = req.params;
    const { input = {} } = req.body;
    
    // Auth check
    if (!req.user || !req.tenant) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const accessToken = {
      ...TOOL_ACCESS_TOKEN,
      user_role: req.user.role || 'user',
      user_id: req.user.id,
      tenant_id: req.tenant.id
    };

    const result = await executeChain(
      chainName,
      input,
      req.tenant,
      req.user.id,
      accessToken,
      { dryRun: true }
    );

    res.json({
      success: result.tag === 'Ok',
      ...result
    });
  } catch (error) {
    logger.error('[Braid Chain API] Dry-run error:', error.message);
    res.status(500).json({
      success: false,
      error: 'DryRunError',
      message: error.message
    });
  }
});

export default router;
