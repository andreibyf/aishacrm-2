/**
 * Workflows v2 API Routes
 * 
 * Enhanced workflow endpoints with AI-powered analytics:
 * - Workflow health analysis and optimization suggestions
 * - Execution pattern insights and predictions
 * - Node performance metrics and bottleneck detection
 * 
 * All endpoints return aiContext with predictions and suggestions.
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { cacheList, cacheDetail } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

const ENABLE_AI_ENRICHMENT = process.env.AI_ENRICHMENT_ENABLED !== 'false';
const SLOW_THRESHOLD_MS = parseInt(process.env.AI_CONTEXT_SLOW_THRESHOLD_MS || '500', 10);

/**
 * Log warning if processing exceeds threshold
 */
function warnIfSlow(operation, processingTime) {
  if (processingTime > SLOW_THRESHOLD_MS) {
    logger.warn(`[workflows.v2] SLOW: ${operation} took ${processingTime}ms (threshold: ${SLOW_THRESHOLD_MS}ms)`);
  }
}

/**
 * Normalize workflow row (same as v1)
 */
function normalizeWorkflow(row) {
  if (!row) return row;

  let meta = row.metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  meta = meta && typeof meta === 'object' ? meta : {};

  return {
    ...row,
    trigger: row.trigger_type || row.trigger_config
      ? { type: row.trigger_type || 'webhook', config: row.trigger_config || {} }
      : undefined,
    nodes: meta.nodes || [],
    connections: meta.connections || [],
    webhook_url: meta.webhook_url || null,
    execution_count: meta.execution_count || 0,
    last_executed: meta.last_executed || null,
  };
}

/**
 * Create stub AI context when enrichment is disabled or fails
 */
function createStubAiContext(startTime, error = null) {
  return {
    confidence: 0,
    suggestions: [],
    predictions: null,
    insights: error ? [`AI enrichment unavailable: ${error}`] : ['AI enrichment disabled'],
    health: null,
    processingTime: Date.now() - startTime,
    _stub: true,
  };
}

/**
 * Analyze workflow structure for issues
 */
function analyzeWorkflowStructure(workflow) {
  const issues = [];
  const suggestions = [];
  const nodes = workflow.nodes || [];
  const connections = workflow.connections || [];

  // Check for empty workflow
  if (nodes.length === 0) {
    issues.push({ type: 'empty', severity: 'high', message: 'Workflow has no nodes' });
    suggestions.push({
      action: 'add_nodes',
      priority: 'high',
      reason: 'Workflow cannot execute without nodes',
      confidence: 1.0,
    });
  }

  // Check for trigger node
  const triggerNodes = nodes.filter(n => 
    n.type === 'webhook_trigger' || n.type === 'schedule_trigger' || n.type === 'manual_trigger'
  );
  if (triggerNodes.length === 0 && nodes.length > 0) {
    issues.push({ type: 'no_trigger', severity: 'high', message: 'No trigger node found' });
    suggestions.push({
      action: 'add_trigger',
      priority: 'high',
      reason: 'Workflow needs a trigger to start execution',
      confidence: 0.95,
    });
  }

  // Check for orphan nodes (no incoming or outgoing connections)
  const connectedNodeIds = new Set();
  connections.forEach(c => {
    connectedNodeIds.add(c.from);
    connectedNodeIds.add(c.to);
  });
  
  const orphanNodes = nodes.filter(n => 
    !connectedNodeIds.has(n.id) && 
    !['webhook_trigger', 'schedule_trigger', 'manual_trigger'].includes(n.type)
  );
  
  if (orphanNodes.length > 0) {
    issues.push({ 
      type: 'orphan_nodes', 
      severity: 'medium', 
      message: `${orphanNodes.length} node(s) are not connected`,
      nodeIds: orphanNodes.map(n => n.id),
    });
    suggestions.push({
      action: 'connect_orphan_nodes',
      priority: 'medium',
      reason: `${orphanNodes.length} nodes will never execute`,
      confidence: 0.9,
    });
  }

  // Check for dead ends (nodes with no outgoing connections that aren't terminal)
  const terminalTypes = ['send_email', 'http_request', 'update_lead', 'update_contact', 'update_account', 'create_activity'];
  const nodesWithOutgoing = new Set(connections.map(c => c.from));
  const deadEndNodes = nodes.filter(n => 
    !nodesWithOutgoing.has(n.id) && 
    !terminalTypes.includes(n.type) &&
    !['webhook_trigger', 'schedule_trigger', 'manual_trigger'].includes(n.type)
  );

  if (deadEndNodes.length > 0 && nodes.length > 1) {
    issues.push({
      type: 'dead_ends',
      severity: 'low',
      message: `${deadEndNodes.length} non-terminal node(s) have no outgoing connections`,
      nodeIds: deadEndNodes.map(n => n.id),
    });
  }

  // Check for condition nodes without both branches
  const conditionNodes = nodes.filter(n => n.type === 'condition');
  conditionNodes.forEach(cn => {
    const outgoingFromCondition = connections.filter(c => c.from === cn.id);
    if (outgoingFromCondition.length < 2) {
      issues.push({
        type: 'incomplete_condition',
        severity: 'medium',
        message: `Condition node "${cn.config?.name || cn.id}" has only ${outgoingFromCondition.length} branch(es)`,
        nodeId: cn.id,
      });
      suggestions.push({
        action: 'complete_condition_branches',
        priority: 'medium',
        reason: 'Condition nodes should have both true and false branches',
        confidence: 0.85,
      });
    }
  });

  return { issues, suggestions };
}

/**
 * Calculate workflow health score
 */
function calculateWorkflowHealth(workflow, executions) {
  const nodes = workflow.nodes || [];
  const connections = workflow.connections || [];
  
  let score = 100;
  let status = 'healthy';
  const factors = [];

  // Structure score (30 points)
  if (nodes.length === 0) {
    score -= 30;
    factors.push('No nodes defined');
  } else {
    // Check for trigger
    const hasTrigger = nodes.some(n => 
      ['webhook_trigger', 'schedule_trigger', 'manual_trigger'].includes(n.type)
    );
    if (!hasTrigger) {
      score -= 15;
      factors.push('Missing trigger node');
    }
    
    // Check connection ratio
    const expectedConnections = Math.max(0, nodes.length - 1);
    const connectionRatio = expectedConnections > 0 ? connections.length / expectedConnections : 1;
    if (connectionRatio < 0.5) {
      score -= 10;
      factors.push('Low connection density');
    }
  }

  // Execution success rate (40 points)
  if (executions.length > 0) {
    const successCount = executions.filter(e => e.status === 'completed').length;
    const failCount = executions.filter(e => e.status === 'failed').length;
    const successRate = successCount / executions.length;
    
    if (successRate < 0.5) {
      score -= 40;
      factors.push(`Low success rate (${Math.round(successRate * 100)}%)`);
    } else if (successRate < 0.8) {
      score -= 20;
      factors.push(`Moderate success rate (${Math.round(successRate * 100)}%)`);
    } else if (successRate < 0.95) {
      score -= 10;
      factors.push(`Good success rate (${Math.round(successRate * 100)}%)`);
    }

    // Penalize high failure count
    if (failCount > 10) {
      score -= Math.min(15, failCount);
      factors.push(`${failCount} failed executions`);
    }
  } else {
    // No executions yet
    score -= 10;
    factors.push('No execution history');
  }

  // Activity score (20 points)
  if (!workflow.is_active) {
    score -= 20;
    factors.push('Workflow is inactive');
  }

  // Recent execution score (10 points)
  if (executions.length > 0) {
    const lastExecution = executions[0];
    const daysSinceLastExec = lastExecution?.started_at 
      ? Math.floor((Date.now() - new Date(lastExecution.started_at)) / (1000 * 60 * 60 * 24))
      : 999;
    
    if (daysSinceLastExec > 30) {
      score -= 10;
      factors.push(`No executions in ${daysSinceLastExec} days`);
    } else if (daysSinceLastExec > 7) {
      score -= 5;
      factors.push(`Last execution ${daysSinceLastExec} days ago`);
    }
  }

  // Determine status
  score = Math.max(0, Math.min(100, score));
  if (score >= 80) status = 'healthy';
  else if (score >= 60) status = 'needs_attention';
  else if (score >= 40) status = 'at_risk';
  else status = 'critical';

  return { score, status, factors };
}

/**
 * Generate insights from workflow and executions
 */
function generateWorkflowInsights(workflow, executions) {
  const insights = [];
  const nodes = workflow.nodes || [];

  // Node type distribution
  const nodeTypes = {};
  nodes.forEach(n => {
    nodeTypes[n.type] = (nodeTypes[n.type] || 0) + 1;
  });
  
  if (Object.keys(nodeTypes).length > 0) {
    const typesSummary = Object.entries(nodeTypes)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    insights.push(`Node composition: ${typesSummary}`);
  }

  // Execution stats
  if (executions.length > 0) {
    const avgDuration = executions
      .filter(e => e.started_at && e.completed_at)
      .reduce((sum, e) => {
        return sum + (new Date(e.completed_at) - new Date(e.started_at));
      }, 0) / executions.filter(e => e.completed_at).length || 0;
    
    if (avgDuration > 0) {
      insights.push(`Average execution time: ${Math.round(avgDuration / 1000)}s`);
    }

    const successRate = executions.filter(e => e.status === 'completed').length / executions.length;
    insights.push(`Success rate: ${Math.round(successRate * 100)}% (${executions.length} total executions)`);
  }

  // Trigger type
  if (workflow.trigger_type) {
    insights.push(`Trigger type: ${workflow.trigger_type}`);
  }

  // Webhook URL
  if (workflow.webhook_url) {
    insights.push(`Webhook endpoint available`);
  }

  return insights;
}

/**
 * Generate predictions for workflow
 */
function generateWorkflowPredictions(workflow, executions) {
  const predictions = {
    nextExecutionSuccess: null,
    estimatedDuration: null,
    maintenanceNeeded: false,
    recommendations: [],
  };

  if (executions.length >= 5) {
    // Calculate success probability based on recent history
    const recentExecs = executions.slice(0, 10);
    const recentSuccessRate = recentExecs.filter(e => e.status === 'completed').length / recentExecs.length;
    predictions.nextExecutionSuccess = Math.round(recentSuccessRate * 100) / 100;

    // Estimate duration from successful executions
    const successfulExecs = recentExecs.filter(e => e.status === 'completed' && e.started_at && e.completed_at);
    if (successfulExecs.length > 0) {
      const avgMs = successfulExecs.reduce((sum, e) => {
        return sum + (new Date(e.completed_at) - new Date(e.started_at));
      }, 0) / successfulExecs.length;
      predictions.estimatedDuration = Math.round(avgMs);
    }

    // Check if maintenance is needed
    const recentFailures = recentExecs.filter(e => e.status === 'failed').length;
    if (recentFailures >= 3) {
      predictions.maintenanceNeeded = true;
      predictions.recommendations.push('Review recent failures and fix common issues');
    }
  }

  // Add recommendations based on structure
  const nodes = workflow.nodes || [];
  if (nodes.length > 15) {
    predictions.recommendations.push('Consider breaking into smaller sub-workflows');
  }

  const httpNodes = nodes.filter(n => n.type === 'http_request');
  if (httpNodes.length > 3) {
    predictions.recommendations.push('Multiple HTTP requests may cause timeout issues');
  }

  if (!workflow.is_active && executions.length > 0) {
    predictions.recommendations.push('Workflow is inactive but has execution history - consider reactivating or archiving');
  }

  return predictions;
}

/**
 * Build AI context for a single workflow
 */
async function buildWorkflowAiContext(workflow, _options = {}) {
  const startTime = Date.now();

  if (!workflow || !ENABLE_AI_ENRICHMENT) {
    return createStubAiContext(startTime);
  }

  try {
    const supabase = getSupabaseClient();

    // Fetch recent executions
    const { data: executions } = await supabase
      .from('workflow_execution')
      .select('id, status, started_at, completed_at, trigger_data')
      .eq('workflow_id', workflow.id)
      .order('started_at', { ascending: false })
      .limit(20);

    const executionList = executions || [];

    // Analyze structure
    const { issues, suggestions: structureSuggestions } = analyzeWorkflowStructure(workflow);

    // Calculate health
    const health = calculateWorkflowHealth(workflow, executionList);

    // Generate insights
    const insights = generateWorkflowInsights(workflow, executionList);

    // Generate predictions
    const predictions = generateWorkflowPredictions(workflow, executionList);

    // Combine suggestions
    const suggestions = [...structureSuggestions];
    
    // Add health-based suggestions
    if (health.status === 'at_risk' || health.status === 'critical') {
      suggestions.push({
        action: 'review_workflow',
        priority: 'high',
        reason: `Workflow health is ${health.status} (score: ${health.score}/100)`,
        confidence: 0.9,
      });
    }

    if (predictions.maintenanceNeeded) {
      suggestions.push({
        action: 'perform_maintenance',
        priority: 'high',
        reason: 'Recent execution failures detected',
        confidence: 0.85,
      });
    }

    const processingTime = Date.now() - startTime;
    warnIfSlow('workflow-ai-context', processingTime);

    return {
      confidence: 0.85,
      suggestions,
      predictions,
      insights,
      health,
      structure: {
        nodeCount: (workflow.nodes || []).length,
        connectionCount: (workflow.connections || []).length,
        issues,
      },
      executionStats: {
        total: executionList.length,
        completed: executionList.filter(e => e.status === 'completed').length,
        failed: executionList.filter(e => e.status === 'failed').length,
        running: executionList.filter(e => e.status === 'running').length,
      },
      processingTime,
    };
  } catch (error) {
    logger.error('[workflows.v2] AI context error:', error.message);
    return createStubAiContext(startTime, error.message);
  }
}

export default function createWorkflowV2Routes(_pgPool) {
  const router = express.Router();

  /**
   * @openapi
   * /api/v2/workflows:
   *   get:
   *     summary: List workflows with AI insights
   *     description: Returns workflows with AI-powered health analysis and optimization suggestions.
   *     tags: [workflows-v2]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *         description: Tenant UUID scope
   *       - in: query
   *         name: is_active
   *         schema:
   *           type: boolean
   *         required: false
   *         description: Filter by active status
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *     responses:
   *       200:
   *         description: Workflows list with AI context
   */
  router.get('/', cacheList('workflows', 180), async (req, res) => {
    try {
      const { tenant_id, is_active, limit = 50, offset = 0 } = req.query;
      const supabase = getSupabaseClient();

      let query = supabase
        .from('workflow')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (tenant_id) query = query.eq('tenant_id', tenant_id);
      if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      const workflows = (data || []).map(normalizeWorkflow);

      // Get summary aiContext for the list
      const startTime = Date.now();
      const activeCount = workflows.filter(w => w.is_active).length;
      const inactiveCount = workflows.filter(w => !w.is_active).length;
      const avgNodes = workflows.length > 0 
        ? workflows.reduce((sum, w) => sum + (w.nodes?.length || 0), 0) / workflows.length 
        : 0;

      const listAiContext = {
        confidence: 0.8,
        suggestions: [],
        insights: [
          `${activeCount} active, ${inactiveCount} inactive workflows`,
          `Average ${avgNodes.toFixed(1)} nodes per workflow`,
        ],
        summary: {
          total: count || workflows.length,
          active: activeCount,
          inactive: inactiveCount,
          averageNodes: Math.round(avgNodes * 10) / 10,
        },
        processingTime: Date.now() - startTime,
      };

      if (inactiveCount > activeCount) {
        listAiContext.suggestions.push({
          action: 'review_inactive_workflows',
          priority: 'low',
          reason: 'More inactive than active workflows - consider cleanup',
          confidence: 0.7,
        });
      }

      res.json({
        status: 'success',
        data: workflows,
        aiContext: listAiContext,
        meta: {
          total: count || workflows.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          api_version: 'v2',
        },
      });
    } catch (error) {
      logger.error('[workflows.v2] GET / error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/workflows/{id}:
   *   get:
   *     summary: Get workflow with AI analysis
   *     description: Returns a single workflow with detailed AI-powered health analysis.
   *     tags: [workflows-v2]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         required: false
   *     responses:
   *       200:
   *         description: Workflow with AI context
   *       404:
   *         description: Workflow not found
   */
  router.get('/:id', cacheDetail('workflows', 300), async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;
      const supabase = getSupabaseClient();

      let query = supabase.from('workflow').select('*').eq('id', id);
      if (tenant_id) query = query.eq('tenant_id', tenant_id);

      const { data, error } = await query.single();
      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ status: 'error', message: 'Workflow not found' });
        }
        throw new Error(error.message);
      }

      const workflow = normalizeWorkflow(data);
      const aiContext = await buildWorkflowAiContext(workflow);

      res.json({
        status: 'success',
        data: workflow,
        aiContext,
        meta: {
          api_version: 'v2',
        },
      });
    } catch (error) {
      logger.error('[workflows.v2] GET /:id error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/workflows/{id}/analyze:
   *   get:
   *     summary: Deep analysis of workflow
   *     description: Performs comprehensive AI analysis of workflow structure, performance, and optimization opportunities.
   *     tags: [workflows-v2]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Deep analysis results
   *       404:
   *         description: Workflow not found
   */
  router.get('/:id/analyze', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;
      const supabase = getSupabaseClient();

      let query = supabase.from('workflow').select('*').eq('id', id);
      if (tenant_id) query = query.eq('tenant_id', tenant_id);

      const { data, error } = await query.single();
      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ status: 'error', message: 'Workflow not found' });
        }
        throw new Error(error.message);
      }

      const workflow = normalizeWorkflow(data);

      // Fetch all executions for deep analysis
      const { data: allExecutions } = await supabase
        .from('workflow_execution')
        .select('*')
        .eq('workflow_id', id)
        .order('started_at', { ascending: false })
        .limit(100);

      const executions = allExecutions || [];

      // Structure analysis
      const { issues, suggestions } = analyzeWorkflowStructure(workflow);

      // Health calculation
      const health = calculateWorkflowHealth(workflow, executions);

      // Insights
      const insights = generateWorkflowInsights(workflow, executions);

      // Predictions
      const predictions = generateWorkflowPredictions(workflow, executions);

      // Node-level analysis
      const nodeAnalysis = (workflow.nodes || []).map(node => {
        const nodeExecutions = executions.flatMap(e => {
          const log = e.execution_log || [];
          return log.filter(l => l.node_id === node.id);
        });

        const successCount = nodeExecutions.filter(l => l.status === 'success').length;
        const errorCount = nodeExecutions.filter(l => l.status === 'error').length;
        const totalCount = successCount + errorCount;

        return {
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.config?.name || node.type,
          executionCount: totalCount,
          successRate: totalCount > 0 ? Math.round((successCount / totalCount) * 100) : null,
          errorCount,
          commonErrors: nodeExecutions
            .filter(l => l.error)
            .slice(0, 3)
            .map(l => l.error),
        };
      });

      // Find bottlenecks (nodes with high error rates)
      const bottlenecks = nodeAnalysis
        .filter(n => n.executionCount > 5 && n.successRate !== null && n.successRate < 80)
        .map(n => ({
          nodeId: n.nodeId,
          nodeType: n.nodeType,
          nodeName: n.nodeName,
          successRate: n.successRate,
          suggestion: `Review ${n.nodeName} - success rate is ${n.successRate}%`,
        }));

      const processingTime = Date.now() - startTime;
      warnIfSlow('workflow-deep-analysis', processingTime);

      res.json({
        status: 'success',
        data: {
          workflow: {
            id: workflow.id,
            name: workflow.name,
            is_active: workflow.is_active,
          },
          analysis: {
            health,
            structure: {
              nodeCount: (workflow.nodes || []).length,
              connectionCount: (workflow.connections || []).length,
              issues,
            },
            execution: {
              total: executions.length,
              completed: executions.filter(e => e.status === 'completed').length,
              failed: executions.filter(e => e.status === 'failed').length,
              running: executions.filter(e => e.status === 'running').length,
            },
            nodeAnalysis,
            bottlenecks,
            predictions,
            insights,
            suggestions,
          },
          meta: {
            analyzed_at: new Date().toISOString(),
            processing_time_ms: processingTime,
            api_version: 'v2',
          },
        },
      });
    } catch (error) {
      logger.error('[workflows.v2] GET /:id/analyze error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/workflows/health-summary:
   *   get:
   *     summary: Health summary of all workflows
   *     description: Returns aggregate health metrics for all workflows.
   *     tags: [workflows-v2]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Workflow health summary
   */
  router.get('/health-summary', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { tenant_id } = req.query;
      const supabase = getSupabaseClient();

      // Fetch all workflows
      let wfQuery = supabase.from('workflow').select('*');
      if (tenant_id) wfQuery = wfQuery.eq('tenant_id', tenant_id);

      const { data: workflows, error: wfError } = await wfQuery;
      if (wfError) throw new Error(wfError.message);

      // Fetch recent executions
      let exQuery = supabase
        .from('workflow_execution')
        .select('workflow_id, status, started_at')
        .order('started_at', { ascending: false })
        .limit(500);
      if (tenant_id) exQuery = exQuery.eq('tenant_id', tenant_id);

      const { data: executions } = await exQuery;
      const executionList = executions || [];

      // Group executions by workflow
      const executionsByWorkflow = {};
      executionList.forEach(e => {
        if (!executionsByWorkflow[e.workflow_id]) {
          executionsByWorkflow[e.workflow_id] = [];
        }
        executionsByWorkflow[e.workflow_id].push(e);
      });

      // Calculate health for each workflow
      const workflowHealths = (workflows || []).map(wf => {
        const normalized = normalizeWorkflow(wf);
        const wfExecs = executionsByWorkflow[wf.id] || [];
        const health = calculateWorkflowHealth(normalized, wfExecs);
        return {
          id: wf.id,
          name: wf.name,
          is_active: wf.is_active,
          health,
          executionCount: wfExecs.length,
        };
      });

      // Aggregate stats
      const healthyCount = workflowHealths.filter(w => w.health.status === 'healthy').length;
      const needsAttentionCount = workflowHealths.filter(w => w.health.status === 'needs_attention').length;
      const atRiskCount = workflowHealths.filter(w => w.health.status === 'at_risk').length;
      const criticalCount = workflowHealths.filter(w => w.health.status === 'critical').length;

      const avgScore = workflowHealths.length > 0
        ? workflowHealths.reduce((sum, w) => sum + w.health.score, 0) / workflowHealths.length
        : 0;

      const totalExecutions = executionList.length;
      const successfulExecutions = executionList.filter(e => e.status === 'completed').length;
      const failedExecutions = executionList.filter(e => e.status === 'failed').length;

      const processingTime = Date.now() - startTime;
      warnIfSlow('workflows-health-summary', processingTime);

      // Determine overall status
      let overallStatus = 'healthy';
      if (criticalCount > 0 || atRiskCount > workflowHealths.length * 0.3) {
        overallStatus = 'critical';
      } else if (atRiskCount > 0 || needsAttentionCount > workflowHealths.length * 0.5) {
        overallStatus = 'needs_attention';
      }

      res.json({
        status: 'success',
        data: {
          summary: {
            totalWorkflows: workflowHealths.length,
            activeWorkflows: workflowHealths.filter(w => w.is_active).length,
            averageHealthScore: Math.round(avgScore),
            overallStatus,
            byStatus: {
              healthy: healthyCount,
              needs_attention: needsAttentionCount,
              at_risk: atRiskCount,
              critical: criticalCount,
            },
          },
          executions: {
            total: totalExecutions,
            successful: successfulExecutions,
            failed: failedExecutions,
            successRate: totalExecutions > 0 
              ? Math.round((successfulExecutions / totalExecutions) * 100) 
              : null,
          },
          workflows: workflowHealths.slice(0, 20), // Top 20 with health info
          aiContext: {
            confidence: 0.85,
            suggestions: criticalCount > 0 ? [{
              action: 'review_critical_workflows',
              priority: 'high',
              reason: `${criticalCount} workflow(s) in critical state`,
              confidence: 0.95,
            }] : [],
            insights: [
              `Overall workflow health: ${overallStatus}`,
              `Average health score: ${Math.round(avgScore)}/100`,
              `Execution success rate: ${totalExecutions > 0 ? Math.round((successfulExecutions / totalExecutions) * 100) : 0}%`,
            ],
            processingTime,
          },
          meta: {
            tenant_id: tenant_id || null,
            generated_at: new Date().toISOString(),
            api_version: 'v2',
          },
        },
      });
    } catch (error) {
      logger.error('[workflows.v2] GET /health-summary error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
