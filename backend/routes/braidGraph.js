/**
 * Braid Tool Graph REST API
 * 
 * Endpoints for visualizing and querying tool dependency relationships.
 * Powers dependency graphs, impact analysis, and documentation.
 * 
 * @module routes/braidGraph
 */

import express from 'express';
import logger from '../lib/logger.js';
import {
  TOOL_CATEGORIES,
  TOOL_GRAPH,
  getToolDependencies,
  getToolDependents,
  getToolGraph,
  detectCircularDependencies,
  getToolsByCategory,
  getToolImpactAnalysis
} from '../lib/braidIntegration-v2.js';

const router = express.Router();

/**
 * GET /api/braid/graph
 * 
 * Returns the full tool dependency graph for visualization.
 * 
 * Query params:
 * - category: Filter by category (ACCOUNTS, CONTACTS, LEADS, etc.)
 * - format: 'nodes-edges' (default) or 'adjacency'
 * - includeMetadata: true (default) or false
 * 
 * Response:
 * {
 *   nodes: [{ id, label, category, color, icon, inputs, outputs, effects, description }],
 *   edges: [{ source, target, type }],
 *   categories: { ACCOUNTS: { name, color, icon }, ... }
 * }
 */
router.get('/', (req, res) => {
  try {
    const { category, format = 'nodes-edges', includeMetadata = 'true' } = req.query;

    // Validate category if provided
    if (category && !TOOL_CATEGORIES[category]) {
      return res.status(400).json({
        error: `Invalid category. Available: ${Object.keys(TOOL_CATEGORIES).join(', ')}`
      });
    }

    const graph = getToolGraph({
      category,
      format,
      includeMetadata: includeMetadata === 'true'
    });

    res.json({
      ...graph,
      meta: {
        totalNodes: graph.nodes?.length || Object.keys(graph.adjacency || {}).length,
        totalEdges: graph.edges?.length,
        format,
        filtered: !!category
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Graph] Error:', error);
    res.status(500).json({ error: 'Failed to fetch tool graph', details: error.message });
  }
});

/**
 * GET /api/braid/graph/categories
 * 
 * Returns all tool categories with their tools.
 * 
 * Response:
 * {
 *   categories: {
 *     ACCOUNTS: { name, color, icon, tools: [...] },
 *     ...
 *   }
 * }
 */
router.get('/categories', (req, res) => {
  try {
    const categories = {};

    for (const [key, config] of Object.entries(TOOL_CATEGORIES)) {
      const tools = getToolsByCategory(key);
      categories[key] = {
        ...config,
        toolCount: tools.length,
        tools: tools.map(t => ({
          name: t.name,
          effects: t.effects,
          description: t.description
        }))
      };
    }

    res.json({
      categories,
      totalCategories: Object.keys(categories).length,
      totalTools: Object.keys(TOOL_GRAPH).length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Graph] Categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories', details: error.message });
  }
});

/**
 * GET /api/braid/graph/tool/:toolName
 * 
 * Get detailed info for a specific tool including dependencies and dependents.
 * 
 * Response:
 * {
 *   tool: { name, category, inputs, outputs, effects, description },
 *   dependencies: { direct: [...], transitive: [...] },
 *   dependents: { direct: [...], transitive: [...] }
 * }
 */
router.get('/tool/:toolName', (req, res) => {
  try {
    const { toolName } = req.params;
    const tool = TOOL_GRAPH[toolName];

    if (!tool) {
      return res.status(404).json({
        error: `Tool not found: ${toolName}`,
        availableTools: Object.keys(TOOL_GRAPH).slice(0, 10),
        hint: 'Use GET /api/braid/graph for full list'
      });
    }

    const dependencies = getToolDependencies(toolName);
    const dependents = getToolDependents(toolName);
    const categoryInfo = TOOL_CATEGORIES[tool.category];

    res.json({
      tool: {
        name: toolName,
        ...tool,
        categoryInfo
      },
      dependencies,
      dependents,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Graph] Tool info error:', error);
    res.status(500).json({ error: 'Failed to fetch tool info', details: error.message });
  }
});

/**
 * GET /api/braid/graph/tool/:toolName/impact
 * 
 * Get impact analysis for a tool - what would be affected if it fails.
 * 
 * Response:
 * {
 *   tool: 'create_account',
 *   impactScore: 65,
 *   dependencies: { direct, transitive },
 *   dependents: { direct, transitive },
 *   affectedChains: [{ name, displayName, stepIndex, totalSteps, isRequired }]
 * }
 */
router.get('/tool/:toolName/impact', (req, res) => {
  try {
    const { toolName } = req.params;

    const analysis = getToolImpactAnalysis(toolName);

    if (analysis.error) {
      return res.status(404).json({ error: analysis.error });
    }

    res.json({
      ...analysis,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Graph] Impact analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze tool impact', details: error.message });
  }
});

/**
 * GET /api/braid/graph/dependencies/:toolName
 * 
 * Get what a tool depends on.
 */
router.get('/dependencies/:toolName', (req, res) => {
  try {
    const { toolName } = req.params;
    const result = getToolDependencies(toolName);

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json({
      tool: toolName,
      ...result,
      totalDirect: result.direct.length,
      totalTransitive: result.transitive.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Graph] Dependencies error:', error);
    res.status(500).json({ error: 'Failed to fetch dependencies', details: error.message });
  }
});

/**
 * GET /api/braid/graph/dependents/:toolName
 * 
 * Get what depends on a tool (reverse dependencies).
 */
router.get('/dependents/:toolName', (req, res) => {
  try {
    const { toolName } = req.params;
    const result = getToolDependents(toolName);

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json({
      tool: toolName,
      ...result,
      totalDirect: result.direct.length,
      totalTransitive: result.transitive.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Graph] Dependents error:', error);
    res.status(500).json({ error: 'Failed to fetch dependents', details: error.message });
  }
});

/**
 * GET /api/braid/graph/validate
 * 
 * Check the graph for circular dependencies and other issues.
 * 
 * Response:
 * {
 *   valid: true,
 *   circularDependencies: { hasCircular: false, cycles: [] },
 *   orphanTools: [],
 *   stats: { totalTools, totalEdges, avgDependencies }
 * }
 */
router.get('/validate', (req, res) => {
  try {
    const circularCheck = detectCircularDependencies();

    // Find orphan tools (no dependencies and no dependents)
    const orphanTools = [];
    for (const [name, config] of Object.entries(TOOL_GRAPH)) {
      const hasDeps = (config.dependencies || []).length > 0;
      const hasDependents = Object.values(TOOL_GRAPH).some(
        t => t.dependencies?.includes(name)
      );
      if (!hasDeps && !hasDependents) {
        orphanTools.push(name);
      }
    }

    // Calculate stats
    let totalEdges = 0;
    for (const config of Object.values(TOOL_GRAPH)) {
      totalEdges += (config.dependencies || []).length;
    }

    const stats = {
      totalTools: Object.keys(TOOL_GRAPH).length,
      totalCategories: Object.keys(TOOL_CATEGORIES).length,
      totalEdges,
      avgDependencies: (totalEdges / Object.keys(TOOL_GRAPH).length).toFixed(2),
      orphanCount: orphanTools.length
    };

    res.json({
      valid: !circularCheck.hasCircular,
      circularDependencies: circularCheck,
      orphanTools,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Graph] Validate error:', error);
    res.status(500).json({ error: 'Failed to validate graph', details: error.message });
  }
});

/**
 * GET /api/braid/graph/path/:from/:to
 * 
 * Find dependency path between two tools.
 * 
 * Response:
 * {
 *   from: 'convert_lead_to_account',
 *   to: 'get_lead',
 *   path: ['convert_lead_to_account', 'qualify_lead', 'get_lead'],
 *   pathLength: 3,
 *   exists: true
 * }
 */
router.get('/path/:from/:to', (req, res) => {
  try {
    const { from, to } = req.params;

    if (!TOOL_GRAPH[from]) {
      return res.status(404).json({ error: `Tool not found: ${from}` });
    }
    if (!TOOL_GRAPH[to]) {
      return res.status(404).json({ error: `Tool not found: ${to}` });
    }

    // BFS to find shortest path
    const queue = [[from]];
    const visited = new Set([from]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === to) {
        return res.json({
          from,
          to,
          path,
          pathLength: path.length,
          exists: true,
          timestamp: new Date().toISOString()
        });
      }

      const deps = TOOL_GRAPH[current]?.dependencies || [];
      for (const dep of deps) {
        if (!visited.has(dep) && TOOL_GRAPH[dep]) {
          visited.add(dep);
          queue.push([...path, dep]);
        }
      }
    }

    res.json({
      from,
      to,
      path: null,
      pathLength: -1,
      exists: false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Graph] Path error:', error);
    res.status(500).json({ error: 'Failed to find path', details: error.message });
  }
});

/**
 * GET /api/braid/graph/effects/:effect
 * 
 * Get all tools with a specific effect (create, read, update, delete).
 */
router.get('/effects/:effect', (req, res) => {
  try {
    const { effect } = req.params;
    const validEffects = ['create', 'read', 'update', 'delete'];

    if (!validEffects.includes(effect)) {
      return res.status(400).json({
        error: `Invalid effect. Use: ${validEffects.join(', ')}`
      });
    }

    const tools = [];
    for (const [name, config] of Object.entries(TOOL_GRAPH)) {
      if (config.effects?.includes(effect)) {
        tools.push({
          name,
          category: config.category,
          categoryColor: TOOL_CATEGORIES[config.category]?.color,
          effects: config.effects,
          description: config.description
        });
      }
    }

    res.json({
      effect,
      tools,
      count: tools.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[Braid Graph] Effects error:', error);
    res.status(500).json({ error: 'Failed to fetch tools by effect', details: error.message });
  }
});

export default router;
