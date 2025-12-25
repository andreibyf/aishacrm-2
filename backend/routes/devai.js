/**
 * Developer AI Approvals & Audit Routes
 * Phase 6: Safety, Approvals, Audit, Export (APP-WIDE)
 * Superadmin-only endpoints for managing Developer AI approvals
 */

import express from 'express';
import { authenticateRequest } from '../middleware/authenticate.js';
import { isSuperadmin } from '../lib/developerAI.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { redactSecretsFromObject, isFileExportable } from '../lib/devaiSecurity.js';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createReadStream } from 'fs';

const execAsync = promisify(exec);
const router = express.Router();

// ============================================================================
// MIDDLEWARE - Superadmin Only
// ============================================================================
function requireSuperadmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (!isSuperadmin(req.user)) {
    return res.status(403).json({ 
      error: 'Access denied - superadmin role required',
      userRole: req.user.role 
    });
  }
  
  next();
}

// Apply authentication and superadmin check to all routes
router.use(authenticateRequest);
router.use(requireSuperadmin);

// ============================================================================
// AUDIT LOGGING
// ============================================================================
async function logAuditEvent(actor, action, approvalId = null, details = {}) {
  try {
    const supabase = getSupabaseClient(true); // Use service role
    const redactedDetails = redactSecretsFromObject(details);
    
    const { error } = await supabase
      .from('devai_audit')
      .insert({
        actor,
        action,
        approval_id: approvalId,
        details: redactedDetails,
      });
    
    if (error) {
      console.error('[DevAI Audit] Failed to log event:', error);
    }
  } catch (err) {
    console.error('[DevAI Audit] Exception logging event:', err);
  }
}

// ============================================================================
// GET /api/devai/approvals - List approvals with optional status filter
// ============================================================================
router.get('/approvals', async (req, res) => {
  try {
    const { status } = req.query;
    const supabase = getSupabaseClient(true); // Use service role
    
    let query = supabase
      .from('devai_approvals')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (status) {
      const validStatuses = ['pending', 'approved', 'rejected', 'executed', 'failed'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
      }
      query = query.eq('status', status);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[DevAI] Error fetching approvals:', error);
      return res.status(500).json({ error: 'Failed to fetch approvals' });
    }
    
    // Redact sensitive data before returning
    const redactedData = data.map(approval => ({
      ...approval,
      tool_args: redactSecretsFromObject(approval.tool_args),
      preview: redactSecretsFromObject(approval.preview),
    }));
    
    return res.json({ approvals: redactedData });
  } catch (err) {
    console.error('[DevAI] Exception in GET /approvals:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/devai/approvals/:id - Get single approval details
// ============================================================================
router.get('/approvals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseClient(true);
    
    const { data, error } = await supabase
      .from('devai_approvals')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      return res.status(404).json({ error: 'Approval not found' });
    }
    
    // Redact sensitive data
    const redacted = {
      ...data,
      tool_args: redactSecretsFromObject(data.tool_args),
      preview: redactSecretsFromObject(data.preview),
    };
    
    return res.json({ approval: redacted });
  } catch (err) {
    console.error('[DevAI] Exception in GET /approvals/:id:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// POST /api/devai/approvals/:id/approve - Approve and execute action
// ============================================================================
router.post('/approvals/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  const userId = req.user.id;
  
  try {
    const supabase = getSupabaseClient(true);
    
    // Fetch the approval
    const { data: approval, error: fetchError } = await supabase
      .from('devai_approvals')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }
    
    if (approval.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Can only approve pending requests',
        currentStatus: approval.status 
      });
    }
    
    // Mark as approved
    const approvedAt = new Date().toISOString();
    const { error: approveError } = await supabase
      .from('devai_approvals')
      .update({
        status: 'approved',
        approved_by: userId,
        approved_at: approvedAt,
        note,
      })
      .eq('id', id);
    
    if (approveError) {
      console.error('[DevAI] Error approving:', approveError);
      return res.status(500).json({ error: 'Failed to approve' });
    }
    
    // Log audit event
    await logAuditEvent(userId, 'approved', id, { tool_name: approval.tool_name });
    
    // Execute the action
    let executionResult;
    try {
      executionResult = await executeApprovedAction(approval);
      
      // Update as executed
      await supabase
        .from('devai_approvals')
        .update({
          status: 'executed',
          executed_at: new Date().toISOString(),
          changed_files: executionResult.changed_files || [],
          diff: executionResult.diff || null,
          before_snapshot: executionResult.before_snapshot || null,
          after_snapshot: executionResult.after_snapshot || null,
        })
        .eq('id', id);
      
      await logAuditEvent(userId, 'executed', id, { 
        tool_name: approval.tool_name,
        changed_files: executionResult.changed_files 
      });
      
      return res.json({ 
        success: true, 
        message: 'Approval executed successfully',
        result: redactSecretsFromObject(executionResult)
      });
      
    } catch (execError) {
      console.error('[DevAI] Execution error:', execError);
      
      // Mark as failed
      await supabase
        .from('devai_approvals')
        .update({
          status: 'failed',
          executed_at: new Date().toISOString(),
          error: execError.message,
        })
        .eq('id', id);
      
      await logAuditEvent(userId, 'failed', id, { 
        tool_name: approval.tool_name,
        error: execError.message 
      });
      
      return res.status(500).json({ 
        error: 'Execution failed', 
        details: execError.message 
      });
    }
    
  } catch (err) {
    console.error('[DevAI] Exception in approve:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// POST /api/devai/approvals/:id/reject - Reject a pending approval
// ============================================================================
router.post('/approvals/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;
  
  try {
    const supabase = getSupabaseClient(true);
    
    // Fetch the approval
    const { data: approval, error: fetchError } = await supabase
      .from('devai_approvals')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }
    
    if (approval.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Can only reject pending requests',
        currentStatus: approval.status 
      });
    }
    
    // Mark as rejected
    const { error: rejectError } = await supabase
      .from('devai_approvals')
      .update({
        status: 'rejected',
        approved_by: userId,
        approved_at: new Date().toISOString(),
        rejected_reason: reason || 'No reason provided',
      })
      .eq('id', id);
    
    if (rejectError) {
      console.error('[DevAI] Error rejecting:', rejectError);
      return res.status(500).json({ error: 'Failed to reject' });
    }
    
    // Log audit event
    await logAuditEvent(userId, 'rejected', id, { 
      tool_name: approval.tool_name,
      reason 
    });
    
    return res.json({ success: true, message: 'Approval rejected' });
    
  } catch (err) {
    console.error('[DevAI] Exception in reject:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/devai/approvals/:id/export - Export approval as archive
// ============================================================================
router.get('/approvals/:id/export', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    const supabase = getSupabaseClient(true);
    
    // Fetch the approval
    const { data: approval, error: fetchError } = await supabase
      .from('devai_approvals')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !approval) {
      return res.status(404).json({ error: 'Approval not found' });
    }
    
    if (approval.status !== 'executed') {
      return res.status(400).json({ 
        error: 'Can only export executed approvals',
        currentStatus: approval.status 
      });
    }
    
    // Create export bundle
    const exportPath = await createExportBundle(approval);
    
    // Log audit event
    await logAuditEvent(userId, 'exported', id, { 
      tool_name: approval.tool_name 
    });
    
    // Stream the archive to client
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="devai-approval-${id}.tar.gz"`);
    
    const stream = createReadStream(exportPath);
    stream.pipe(res);
    
    // Cleanup temp file after streaming
    stream.on('end', async () => {
      try {
        await fs.unlink(exportPath);
      } catch (err) {
        console.error('[DevAI] Failed to cleanup export file:', err);
      }
    });
    
  } catch (_err) {
    console.error('[DevAI] Exception in export:', _err);
    return res.status(500).json({ error: 'Failed to create export' });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Execute an approved action based on tool name and arguments
 */
async function executeApprovedAction(approval) {
  const { tool_name, tool_args } = approval;
  
  switch (tool_name) {
    case 'apply_patch':
      return await applyPatch(tool_args);
    
    case 'write_file':
      return await writeFile(tool_args);
    
    case 'run_command':
      return await runCommand(tool_args);
    
    default:
      throw new Error(`Unknown tool: ${tool_name}`);
  }
}

/**
 * Apply a unified diff patch
 */
async function applyPatch(args) {
  const { patch, target_dir = '/app' } = args;
  
  if (!patch) {
    throw new Error('Patch content required');
  }
  
  // Create temp patch file
  const tempDir = '/tmp/devai-' + Date.now();
  await fs.mkdir(tempDir, { recursive: true });
  const patchFile = path.join(tempDir, 'changes.patch');
  await fs.writeFile(patchFile, patch);
  
  try {
    // Apply patch with git apply (safer than patch command)
    const { stdout, stderr } = await execAsync(
      `git apply --check "${patchFile}" && git apply "${patchFile}"`,
      { cwd: target_dir }
    );
    
    // Parse changed files from patch
    const changedFiles = [];
    const filePattern = /^---\s+a\/(.+)$/gm;
    let match;
    while ((match = filePattern.exec(patch)) !== null) {
      changedFiles.push(match[1]);
    }
    
    return {
      success: true,
      changed_files: changedFiles,
      diff: patch,
      stdout,
      stderr,
    };
  } finally {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Write content to a file
 */
async function writeFile(args) {
  const { file_path, content } = args;
  
  if (!file_path || !content) {
    throw new Error('file_path and content required');
  }
  
  // Read before snapshot
  let beforeContent = null;
  try {
    beforeContent = await fs.readFile(file_path, 'utf-8');
  } catch (_err) {
    // File might not exist yet
  }
  
  // Write new content
  const dir = path.dirname(file_path);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file_path, content, 'utf-8');
  
  // Generate diff
  let diff = null;
  if (beforeContent) {
    // Simple diff (could use diff library for better formatting)
    diff = `--- ${file_path}\n+++ ${file_path}\n${content}`;
  }
  
  return {
    success: true,
    changed_files: [file_path],
    diff,
    before_snapshot: { [file_path]: beforeContent },
    after_snapshot: { [file_path]: content },
  };
}

/**
 * Run a shell command (already approved)
 */
async function runCommand(args) {
  const { command, cwd = '/app' } = args;
  
  if (!command) {
    throw new Error('Command required');
  }
  
  const { stdout, stderr } = await execAsync(command, { cwd });
  
  return {
    success: true,
    command,
    stdout,
    stderr,
    changed_files: [], // Command execution doesn't track file changes automatically
  };
}

/**
 * Create a tar.gz export bundle with manifest and changed files
 */
async function createExportBundle(approval) {
  const tempDir = `/tmp/devai-export-${approval.id}-${Date.now()}`;
  await fs.mkdir(tempDir, { recursive: true });
  
  try {
    // Create manifest
    const manifest = {
      approval_id: approval.id,
      tool_name: approval.tool_name,
      requested_by: approval.requested_by,
      approved_by: approval.approved_by,
      executed_at: approval.executed_at,
      changed_files: approval.changed_files || [],
      excluded_files: [],
    };
    
    await fs.writeFile(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    // Create patch file if diff exists
    if (approval.diff) {
      await fs.writeFile(path.join(tempDir, 'patch.diff'), approval.diff);
    }
    
    // Copy changed files (after state)
    const filesDir = path.join(tempDir, 'files');
    await fs.mkdir(filesDir, { recursive: true });
    
    const changed = approval.changed_files || [];
    for (const file of changed) {
      if (!isFileExportable(file)) {
        manifest.excluded_files.push(file);
        continue;
      }
      
      try {
        const content = await fs.readFile(file, 'utf-8');
        const targetPath = path.join(filesDir, path.basename(file));
        await fs.writeFile(targetPath, content);
      } catch (err) {
        console.warn(`[DevAI Export] Could not export file ${file}:`, err.message);
        manifest.excluded_files.push(file);
      }
    }
    
    // Update manifest with exclusions
    await fs.writeFile(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    // Create tar.gz archive
    const archivePath = `/tmp/devai-approval-${approval.id}.tar.gz`;
    await execAsync(`tar -czf "${archivePath}" -C "${tempDir}" .`);
    
    return archivePath;
    
  } finally {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (_cleanupErr) {
      // Ignore cleanup errors
    }
  }
}

export default router;
