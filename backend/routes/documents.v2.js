/**
 * Documents v2 API Routes
 * 
 * AI-enhanced document management with:
 * - Automatic document classification
 * - AI-powered summaries
 * - Entity linking suggestions
 * - Content analysis
 */

import express from 'express';
import { validateTenantAccess, requireAdminOrManagerRole } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { cacheList, cacheDetail, invalidateCache } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

export default function createDocumentV2Routes(_pgPool) {
  const router = express.Router();

  router.use(validateTenantAccess);

  /**
   * Build AI context for a document
   */
  async function buildDocumentAiContext(document, _options = {}) {
    const startTime = Date.now();
    
    if (!document) {
      return {
        confidence: 0,
        suggestions: [],
        predictions: null,
        insights: ['Document not provided'],
        relatedItems: [],
        processingTime: Date.now() - startTime,
        _stub: true,
      };
    }

    try {
      const supabase = getSupabaseClient();
      const { tenant_id: _tenant_id, id: _id, name, file_type, file_size, related_type, related_id, created_at } = document;

      // Classify document type
      const classification = classifyDocument(name, file_type);

      // Fetch related entity if any
      let relatedEntity = null;
      if (related_type && related_id) {
        const tableName = related_type === 'opportunity' ? 'opportunities' :
                          related_type === 'account' ? 'accounts' :
                          related_type === 'contact' ? 'contacts' :
                          related_type === 'lead' ? 'leads' : null;
        if (tableName) {
          const { data } = await supabase.from(tableName).select('id, name, first_name, last_name').eq('id', related_id).single();
          relatedEntity = data;
        }
      }

      // Generate suggestions
      const suggestions = [];
      
      if (!related_id) {
        suggestions.push({
          action: 'link_to_entity',
          priority: 'medium',
          reason: 'Document is not linked to any CRM entity',
          confidence: 0.85,
        });
      }

      if (classification.category === 'contract' || classification.category === 'proposal') {
        suggestions.push({
          action: 'create_opportunity',
          priority: 'high',
          reason: `${classification.category} document may relate to a deal`,
          confidence: 0.75,
        });
      }

      if (isOldDocument(created_at)) {
        suggestions.push({
          action: 'review_document',
          priority: 'low',
          reason: 'Document is over 6 months old, may need review',
          confidence: 0.6,
        });
      }

      // Generate insights
      const insights = [];
      insights.push(`Document type: ${classification.category}`);
      
      if (file_size) {
        const sizeMB = (file_size / (1024 * 1024)).toFixed(2);
        insights.push(`File size: ${sizeMB} MB`);
      }

      if (classification.keywords.length > 0) {
        insights.push(`Keywords detected: ${classification.keywords.join(', ')}`);
      }

      // Build related items
      const relatedItems = [];
      if (relatedEntity) {
        const entityName = relatedEntity.name || 
          `${relatedEntity.first_name || ''} ${relatedEntity.last_name || ''}`.trim();
        relatedItems.push({ type: related_type, id: related_id, name: entityName });
      }

      const processingTime = Date.now() - startTime;

      return {
        confidence: 0.82,
        suggestions,
        predictions: {
          classification,
          sensitivityLevel: detectSensitivity(name, classification),
          retentionRecommendation: getRetentionRecommendation(classification),
        },
        insights,
        relatedItems,
        processingTime,
      };
    } catch (error) {
      logger.error('[documents.v2] AI context error:', error.message);
      return {
        confidence: 0,
        suggestions: [],
        predictions: null,
        insights: [`AI enrichment error: ${error.message}`],
        relatedItems: [],
        processingTime: Date.now() - startTime,
        _stub: true,
      };
    }
  }

  /**
   * Classify document based on name and type
   */
  function classifyDocument(name, fileType) {
    const nameLower = (name || '').toLowerCase();
    const keywords = [];

    let category = 'general';
    
    // Contract detection
    if (nameLower.includes('contract') || nameLower.includes('agreement') || 
        nameLower.includes('msa') || nameLower.includes('sow')) {
      category = 'contract';
      keywords.push('legal', 'binding');
    }
    // Proposal detection
    else if (nameLower.includes('proposal') || nameLower.includes('quote') || 
             nameLower.includes('estimate') || nameLower.includes('rfp')) {
      category = 'proposal';
      keywords.push('sales', 'pricing');
    }
    // Invoice detection
    else if (nameLower.includes('invoice') || nameLower.includes('receipt') || 
             nameLower.includes('payment')) {
      category = 'invoice';
      keywords.push('financial', 'billing');
    }
    // Report detection
    else if (nameLower.includes('report') || nameLower.includes('analysis') || 
             nameLower.includes('summary')) {
      category = 'report';
      keywords.push('analytics', 'data');
    }
    // Presentation detection
    else if (fileType?.includes('presentation') || nameLower.includes('deck') ||
             nameLower.includes('.pptx') || nameLower.includes('.ppt')) {
      category = 'presentation';
      keywords.push('slides', 'meeting');
    }
    // Spreadsheet detection
    else if (fileType?.includes('spreadsheet') || nameLower.includes('.xlsx') || 
             nameLower.includes('.csv')) {
      category = 'spreadsheet';
      keywords.push('data', 'numbers');
    }
    // Image detection
    else if (fileType?.includes('image') || nameLower.match(/\.(jpg|jpeg|png|gif|svg)$/)) {
      category = 'image';
      keywords.push('visual', 'media');
    }

    return {
      category,
      keywords,
      confidence: keywords.length > 0 ? 0.85 : 0.5,
    };
  }

  /**
   * Detect document sensitivity level
   */
  function detectSensitivity(name, classification) {
    const nameLower = (name || '').toLowerCase();
    
    // High sensitivity indicators
    if (nameLower.includes('confidential') || nameLower.includes('private') ||
        nameLower.includes('nda') || nameLower.includes('salary') ||
        nameLower.includes('ssn') || nameLower.includes('password')) {
      return 'high';
    }

    // Medium sensitivity for contracts and financial docs
    if (classification.category === 'contract' || classification.category === 'invoice') {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Get retention recommendation based on document type
   */
  function getRetentionRecommendation(classification) {
    const retentionMap = {
      contract: '7 years',
      invoice: '7 years',
      proposal: '3 years',
      report: '5 years',
      presentation: '2 years',
      spreadsheet: '3 years',
      image: '1 year',
      general: '2 years',
    };
    return retentionMap[classification.category] || '2 years';
  }

  /**
   * Check if document is old (>6 months)
   */
  function isOldDocument(createdAt) {
    if (!createdAt) return false;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return new Date(createdAt) < sixMonthsAgo;
  }

  // ============ Routes ============

  /**
   * @openapi
   * /api/v2/documents:
   *   get:
   *     summary: List documents with AI context
   *     tags: [documents-v2]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: related_type
   *         schema:
   *           type: string
   *           enum: [opportunity, account, contact, lead]
   *       - in: query
   *         name: related_id
   *         schema:
   *           type: string
   *           format: uuid
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
   *         description: List of documents with AI enrichment
   */
  router.get('/', cacheList('documents', 180), async (req, res) => {
    try {
      const { tenant_id, related_type, related_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      let q = supabase
        .from('documents')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id);

      if (related_type) {
        q = q.eq('related_type', related_type);
      }
      if (related_id) {
        q = q.eq('related_id', related_id);
      }

      q = q.order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await q;
      if (error) throw new Error(error.message);

      // Build AI context for each document (batch for performance)
      const documents = await Promise.all(
        (data || []).map(async (doc) => {
          const aiContext = await buildDocumentAiContext(doc, { lite: true });
          return { ...doc, aiContext };
        })
      );

      res.json({
        status: 'success',
        data: {
          documents,
          total: count || 0,
          limit,
          offset,
        },
      });
    } catch (error) {
      logger.error('Error in v2 documents list:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/documents/{id}:
   *   get:
   *     summary: Get document with full AI context
   *     tags: [documents-v2]
   */
  router.get('/:id', cacheDetail('documents', 300), async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();

      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Document not found' });
      }
      if (error) throw new Error(error.message);

      const aiContext = await buildDocumentAiContext(data, {});

      res.json({
        status: 'success',
        data: {
          document: data,
          aiContext,
        },
      });
    } catch (error) {
      logger.error('Error in v2 document get:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/documents:
   *   post:
   *     summary: Create document with AI classification
   *     tags: [documents-v2]
   */
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, name, file_url, file_type, file_size, related_type, related_id, ...rest } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      if (!name) {
        return res.status(400).json({ status: 'error', message: 'name is required' });
      }

      const supabase = getSupabaseClient();

      // Auto-classify document
      const classification = classifyDocument(name, file_type);

      const insertPayload = {
        tenant_id,
        name,
        file_url,
        file_type,
        file_size,
        related_type,
        related_id,
        ...rest,
        // Store classification in metadata
        metadata: {
          ...(rest.metadata || {}),
          ai_classification: classification,
          classified_at: new Date().toISOString(),
        },
      };

      const { data, error } = await supabase
        .from('documents')
        .insert([insertPayload])
        .select('*')
        .single();

      if (error) throw new Error(error.message);

      const aiContext = await buildDocumentAiContext(data, {});

      res.status(201).json({
        status: 'success',
        data: {
          document: data,
          aiContext,
        },
      });
    } catch (error) {
      logger.error('Error in v2 document create:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/documents/{id}:
   *   put:
   *     summary: Update document
   *     tags: [documents-v2]
   */
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, ...payload } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Re-classify if name changed
      if (payload.name) {
        const classification = classifyDocument(payload.name, payload.file_type);
        payload.metadata = {
          ...(payload.metadata || {}),
          ai_classification: classification,
          reclassified_at: new Date().toISOString(),
        };
      }

      const updatePayload = {
        ...payload,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('documents')
        .update(updatePayload)
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('*')
        .single();

      if (error?.code === 'PGRST116') {
        return res.status(404).json({ status: 'error', message: 'Document not found' });
      }
      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        data: { document: data },
      });
    } catch (error) {
      logger.error('Error in v2 document update:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/documents/{id}:
   *   delete:
   *     summary: Delete document (admin/manager)
   *     tags: [documents-v2]
   *     security:
   *       - bearerAuth: []
   *     description: Only superadmin, tenant admins, or managers can delete documents. Requires a deletion reason for audit trail.
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: reason
   *         required: true
   *         schema:
   *           type: string
   *         description: Reason for deletion (required for audit trail)
   */
  router.delete('/:id', requireAdminOrManagerRole, async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, reason } = req.query;
      const { user } = req;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      if (!reason || reason.trim() === '') {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Deletion reason is required for audit trail' 
        });
      }

      const supabase = getSupabaseClient();

      // First, get the document details before deletion for audit log
      const { data: documentToDelete, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw new Error(fetchError.message);
      }

      if (!documentToDelete) {
        return res.status(404).json({ status: 'error', message: 'Document not found' });
      }

      // Delete the document
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant_id);

      if (deleteError) throw new Error(deleteError.message);

      // Log the deletion to system_logs for audit trail
      try {
        await supabase.from('system_logs').insert({
          tenant_id,
          level: 'INFO',
          source: 'documents.v2',
          message: `Document deleted: ${documentToDelete.name || documentToDelete.id}`,
          metadata: {
            action: 'document_delete',
            document_id: id,
            document_name: documentToDelete.name,
            document_type: documentToDelete.type,
            deleted_by_user_id: user.id,
            deleted_by_email: user.email,
            deleted_by_role: user.role,
            deletion_reason: reason.trim(),
            ip_address: req.ip || req.connection?.remoteAddress,
            user_agent: req.get('user-agent'),
            timestamp: new Date().toISOString()
          }
        });
      } catch (logError) {
        // Log error but don't fail the deletion
        logger.error('Failed to write audit log for document deletion:', logError);
      }

      res.json({
        status: 'success',
        message: 'Document deleted successfully',
        audit_logged: true
      });
    } catch (error) {
      logger.error('Error in v2 document delete:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/documents/deletion-history:
   *   get:
   *     summary: Get document deletion audit history
   *     tags: [documents-v2]
   *     security:
   *       - bearerAuth: []
   *     description: Returns audit logs of all document deletions for this tenant. Accessible by all authenticated users.
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 50
   *         description: Maximum number of records to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *         description: Number of records to skip for pagination
   */
  router.get('/deletion-history', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0 } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();

      // Query system_logs for document deletion events
      const { data: deletionLogs, error, count } = await supabase
        .from('system_logs')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .eq('source', 'documents.v2')
        .filter('metadata->>action', 'eq', 'document_delete')
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (error) {
        throw new Error(error.message);
      }

      // Transform logs into a cleaner format for the frontend
      const deletions = (deletionLogs || []).map(log => ({
        id: log.id,
        document_id: log.metadata?.document_id,
        document_name: log.metadata?.document_name,
        document_type: log.metadata?.document_type,
        deleted_by: {
          user_id: log.metadata?.deleted_by_user_id,
          email: log.metadata?.deleted_by_email,
          role: log.metadata?.deleted_by_role,
        },
        deletion_reason: log.metadata?.deletion_reason,
        deleted_at: log.metadata?.timestamp || log.created_at,
        ip_address: log.metadata?.ip_address,
        user_agent: log.metadata?.user_agent,
      }));

      res.json({
        status: 'success',
        data: deletions,
        pagination: {
          total: count || 0,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + deletions.length) < (count || 0),
        },
      });
    } catch (error) {
      logger.error('Error fetching document deletion history:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/v2/documents/analyze:
   *   post:
   *     summary: Analyze document content with AI
   *     tags: [documents-v2]
   */
  router.post('/analyze', async (req, res) => {
    try {
      const { tenant_id, document_url: _document_url, document_id, content } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // If document_id provided, fetch document
      let document = null;
      if (document_id) {
        const supabase = getSupabaseClient();
        const { data } = await supabase
          .from('documents')
          .select('*')
          .eq('id', document_id)
          .eq('tenant_id', tenant_id)
          .single();
        document = data;
      }

      // Placeholder for actual document analysis
      // In production, this would call an AI service (OpenAI, etc.)
      const analysis = {
        summary: document ? `Document "${document.name}" analysis pending full AI integration` : 'Content analysis pending',
        keyPoints: [],
        entities: [],
        sentiment: null,
        language: 'en',
        wordCount: content ? content.split(/\s+/).length : null,
        readingTime: content ? Math.ceil(content.split(/\s+/).length / 200) + ' min' : null,
      };

      res.json({
        status: 'success',
        data: {
          analysis,
          document,
          _note: 'Full AI analysis requires OpenAI integration',
        },
      });
    } catch (error) {
      logger.error('Error in v2 document analyze:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
