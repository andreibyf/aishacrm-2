/**
 * Workflow Templates API Routes
 * 
 * Provides template management and instantiation for AI-accessible workflow patterns.
 * Templates are pre-built workflow structures with configurable parameters.
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';

/**
 * Substitute parameter values into template nodes
 */
function substituteParameters(nodes, connections, parameterValues) {
  const substitutedNodes = JSON.parse(JSON.stringify(nodes));
  const substitutedConnections = JSON.parse(JSON.stringify(connections));

  // Recursive substitution in object
  function substitute(obj) {
    if (typeof obj === 'string') {
      // Replace {{param_name}} with actual value
      return obj.replace(/\{\{(\w+)\}\}/g, (match, paramName) => {
        // Check if it's a template parameter (not a webhook field like {{email}})
        if (Object.prototype.hasOwnProperty.call(parameterValues, paramName)) {
          return parameterValues[paramName];
        }
        return match; // Keep original if not a parameter
      });
    }
    if (Array.isArray(obj)) {
      return obj.map(substitute);
    }
    if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = substitute(value);
      }
      return result;
    }
    return obj;
  }

  return {
    nodes: substitute(substitutedNodes),
    connections: substitute(substitutedConnections),
  };
}

/**
 * Validate parameter values against template parameters
 */
function validateParameters(templateParams, providedValues) {
  const errors = [];
  const validated = {};

  for (const param of templateParams) {
    const value = providedValues[param.name];
    
    if (param.required && (value === undefined || value === null || value === '')) {
      if (param.default !== undefined && param.default !== '') {
        validated[param.name] = param.default;
      } else {
        errors.push(`Missing required parameter: ${param.name}`);
      }
    } else if (value !== undefined) {
      // Type validation
      switch (param.type) {
        case 'number': {
          const num = Number(value);
          if (isNaN(num)) {
            errors.push(`Parameter ${param.name} must be a number`);
          } else {
            validated[param.name] = num;
          }
          break;
        }
        case 'url': {
          try {
            new URL(value);
            validated[param.name] = value;
          } catch {
            errors.push(`Parameter ${param.name} must be a valid URL`);
          }
          break;
        }
        case 'select': {
          if (param.options && !param.options.includes(value)) {
            errors.push(`Parameter ${param.name} must be one of: ${param.options.join(', ')}`);
          } else {
            validated[param.name] = value;
          }
          break;
        }
        default:
          validated[param.name] = value;
      }
    } else if (param.default !== undefined) {
      validated[param.name] = param.default;
    }
  }

  return { validated, errors };
}

export default function createWorkflowTemplateRoutes(_pgPool) {
  const router = express.Router();

  /**
   * @openapi
   * /api/workflow-templates:
   *   get:
   *     summary: List all workflow templates
   *     description: Returns available workflow templates for AI instantiation.
   *     tags: [workflow-templates]
   *     parameters:
   *       - in: query
   *         name: category
   *         schema:
   *           type: string
   *         description: Filter by category
   *       - in: query
   *         name: is_active
   *         schema:
   *           type: boolean
   *           default: true
   *     responses:
   *       200:
   *         description: List of workflow templates
   */
  router.get('/', async (req, res) => {
    try {
      const { category, is_active = 'true' } = req.query;
      const supabase = getSupabaseClient();

      let query = supabase
        .from('workflow_template')
        .select('id, name, description, category, parameters, use_cases, is_active, is_system, created_at')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (is_active !== 'all') {
        query = query.eq('is_active', is_active === 'true');
      }
      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      // Format for AI consumption - include parameter descriptions
      const templates = (data || []).map(t => ({
        ...t,
        parameter_summary: (t.parameters || []).map(p => 
          `${p.name} (${p.type}${p.required ? ', required' : ''}): ${p.description}`
        ).join('; '),
      }));

      res.json({
        status: 'success',
        data: templates,
        meta: {
          total: templates.length,
          categories: [...new Set(templates.map(t => t.category))],
        },
      });
    } catch (error) {
      logger.error('[workflow-templates] GET / error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/workflow-templates/{id}:
   *   get:
   *     summary: Get template details
   *     description: Returns full template structure including nodes and connections.
   *     tags: [workflow-templates]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Template details
   *       404:
   *         description: Template not found
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('workflow_template')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ status: 'error', message: 'Template not found' });
        }
        throw new Error(error.message);
      }

      res.json({
        status: 'success',
        data,
      });
    } catch (error) {
      logger.error('[workflow-templates] GET /:id error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/workflow-templates/{id}/instantiate:
   *   post:
   *     summary: Create workflow from template
   *     description: Instantiates a workflow from a template with provided parameter values.
   *     tags: [workflow-templates]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id]
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               name:
   *                 type: string
   *                 description: Custom name for the workflow (optional, defaults to template name)
   *               parameters:
   *                 type: object
   *                 description: Parameter values to substitute
   *     responses:
   *       201:
   *         description: Workflow created successfully
   *       400:
   *         description: Invalid parameters
   *       404:
   *         description: Template not found
   */
  router.post('/:id/instantiate', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, name, parameters: paramValues = {} } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Fetch template
      const { data: template, error: templateError } = await supabase
        .from('workflow_template')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .single();

      if (templateError) {
        if (templateError.code === 'PGRST116') {
          return res.status(404).json({ status: 'error', message: 'Template not found or inactive' });
        }
        throw new Error(templateError.message);
      }

      // Validate parameters
      const { validated, errors } = validateParameters(template.parameters || [], paramValues);
      if (errors.length > 0) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Parameter validation failed',
          errors,
        });
      }

      // Substitute parameters into template
      const { nodes, connections } = substituteParameters(
        template.template_nodes,
        template.template_connections,
        validated
      );

      // Create workflow
      const workflowName = name || `${template.name} (from template)`;
      const metadata = {
        nodes,
        connections,
        webhook_url: null,
        execution_count: 0,
        last_executed: null,
        template_id: template.id,
        template_name: template.name,
        instantiated_parameters: validated,
      };

      const { data: workflow, error: workflowError } = await supabase
        .from('workflow')
        .insert({
          tenant_id,
          name: workflowName,
          description: template.description,
          trigger_type: template.trigger_type,
          trigger_config: template.trigger_config,
          is_active: true,
          metadata,
        })
        .select()
        .single();

      if (workflowError) throw new Error(workflowError.message);

      // Update webhook URL
      const webhookUrl = `/api/workflows/${workflow.id}/webhook`;
      await supabase
        .from('workflow')
        .update({ metadata: { ...metadata, webhook_url: webhookUrl } })
        .eq('id', workflow.id);

      res.status(201).json({
        status: 'success',
        message: `Workflow "${workflowName}" created from template "${template.name}"`,
        data: {
          workflow_id: workflow.id,
          workflow_name: workflowName,
          webhook_url: webhookUrl,
          template_used: template.name,
          parameters_applied: validated,
        },
      });
    } catch (error) {
      logger.error('[workflow-templates] POST /:id/instantiate error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/workflow-templates/categories:
   *   get:
   *     summary: List template categories
   *     description: Returns available template categories with counts.
   *     tags: [workflow-templates]
   *     responses:
   *       200:
   *         description: Category list
   */
  router.get('/categories', async (req, res) => {
    try {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('workflow_template')
        .select('category')
        .eq('is_active', true);

      if (error) throw new Error(error.message);

      // Count by category
      const categoryCounts = {};
      (data || []).forEach(t => {
        categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
      });

      const categories = Object.entries(categoryCounts).map(([name, count]) => ({
        name,
        count,
        description: getCategoryDescription(name),
      }));

      res.json({
        status: 'success',
        data: categories,
      });
    } catch (error) {
      logger.error('[workflow-templates] GET /categories error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/workflow-templates:
   *   post:
   *     summary: Create custom template
   *     description: Creates a new workflow template (admin only).
   *     tags: [workflow-templates]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, template_nodes]
   *     responses:
   *       201:
   *         description: Template created
   */
  router.post('/', async (req, res) => {
    try {
      const { 
        name, 
        description, 
        category = 'general',
        template_nodes,
        template_connections = [],
        trigger_type = 'webhook',
        trigger_config = {},
        parameters = [],
        use_cases = [],
      } = req.body;

      if (!name || !template_nodes) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'name and template_nodes are required' 
        });
      }

      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('workflow_template')
        .insert({
          name,
          description,
          category,
          template_nodes,
          template_connections,
          trigger_type,
          trigger_config,
          parameters,
          use_cases,
          is_active: true,
          is_system: false,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      res.status(201).json({
        status: 'success',
        data,
      });
    } catch (error) {
      logger.error('[workflow-templates] POST / error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}

/**
 * Get human-readable category descriptions
 */
function getCategoryDescription(category) {
  const descriptions = {
    'lead_nurturing': 'Templates for nurturing and engaging leads',
    'lead_qualification': 'Templates for qualifying and scoring leads',
    'sales_pipeline': 'Templates for sales process automation',
    'integrations': 'Templates for external system integrations',
    'account_management': 'Templates for account health and management',
    'general': 'General purpose workflow templates',
  };
  return descriptions[category] || 'Custom workflow templates';
}
