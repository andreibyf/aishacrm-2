/**
 * GitHub Issues Route - Autonomous Issue Creation for Health Monitoring
 * Creates GitHub issues with AI-generated diagnostics and suggested fixes
 */

import express from 'express';
import fetch from 'node-fetch';
import crypto from 'crypto';

const router = express.Router();

// GitHub Configuration (token fallback + normalization)
const RAW_GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
const GITHUB_TOKEN = (RAW_GITHUB_TOKEN || '').trim();
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'andreibyf';
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || 'aishacrm-2';
const GITHUB_API_BASE = 'https://api.github.com';

// Environment / build metadata
const ENVIRONMENT = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
const BUILD_VERSION = process.env.APP_BUILD_VERSION || process.env.BUILD_VERSION || 'dev-local';

/**
 * POST /api/github-issues/create-health-issue
 * Create a GitHub issue for health monitoring failures
 * Body: { type, title, description, context, suggestedFix, severity, component }
 */
router.post('/create-health-issue', async (req, res) => {
  try {
    if (!GITHUB_TOKEN) {
      return res.status(503).json({
        success: false,
        error: 'GitHub token not configured',
        message: 'GITHUB_TOKEN environment variable is required for autonomous issue creation'
      });
    }

    const {
      type, // 'api' | 'mcp' | 'system'
      title,
      description,
      context,
      suggestedFix,
      severity, // 'critical' | 'high' | 'medium' | 'low'
      component, // e.g., 'backend', 'mcp-server', 'database'
      assignee // optional GitHub username
    } = req.body;

    // Validate required fields
    if (!type || !title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['type', 'title', 'description']
      });
    }

    // Generate request ID for traceability
    const requestId = crypto.randomUUID();

    // Build issue body with structured information + metadata footer
    const issueBody = buildIssueBody({
      type,
      description,
      context,
      suggestedFix,
      severity,
      component,
      environment: ENVIRONMENT,
      buildVersion: BUILD_VERSION,
      requestId
    });

    // Determine labels based on type, severity, component, and environment
    const labels = buildLabels(type, severity, component, ENVIRONMENT);

    // Create GitHub issue
    let finalTitle = `[${type.toUpperCase()}] ${title}`;
    if (ENVIRONMENT === 'dev') {
      // Prefix dev issues for immediate visual distinction
      finalTitle = `[DEV-${type.toUpperCase()}] ${title}`;
    }
    const issuePayload = {
      title: finalTitle,
      body: issueBody,
      labels,
      ...(assignee && { assignees: [assignee] })
    };

    console.log('[GitHub Issues] Creating issue:', {
      title: issuePayload.title,
      labels,
      assignee
    });

    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'aishacrm-health-monitor'
        },
        body: JSON.stringify(issuePayload)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GitHub Issues] API error:', response.status, errorText);
      return res.status(response.status).json({
        success: false,
        error: 'GitHub API error',
        details: errorText
      });
    }

    const issue = await response.json();
    console.log('[GitHub Issues] Issue created:', issue.html_url);

    // Trigger GitHub Copilot review workflow (optional)
    if (process.env.TRIGGER_COPILOT_REVIEW === 'true') {
      await triggerCopilotReview(issue.number);
    }

    res.json({
      success: true,
      issue: {
        number: issue.number,
        url: issue.html_url,
        title: issue.title,
        state: issue.state,
        labels: issue.labels.map(l => l.name)
      }
    });

  } catch (error) {
    console.error('[GitHub Issues] Error creating issue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create GitHub issue',
      message: error.message
    });
  }
});

/**
 * POST /api/github-issues/assign-copilot
 * Assign GitHub Copilot to an issue for automated fix generation
 * Body: { issueNumber, additionalContext }
 */
router.post('/assign-copilot', async (req, res) => {
  try {
    if (!GITHUB_TOKEN) {
      return res.status(503).json({
        success: false,
        error: 'GitHub token not configured'
      });
    }

    const { issueNumber, additionalContext } = req.body;

    if (!issueNumber) {
      return res.status(400).json({
        success: false,
        error: 'Missing issueNumber'
      });
    }

    // Add comment requesting Copilot review
    const commentBody = `🤖 **GitHub Copilot Review Requested**

@github-copilot please analyze this issue and:
1. Review the diagnostic information and suggested fix
2. Implement the fix with comprehensive error handling
3. Add tests to prevent regression
4. Create a PR for review

${additionalContext ? `\n**Additional Context:**\n${additionalContext}` : ''}

---
*This is an automated request from the AishaCRM health monitoring system.*`;

    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/issues/${issueNumber}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'aishacrm-health-monitor'
        },
        body: JSON.stringify({ body: commentBody })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: 'Failed to add comment',
        details: errorText
      });
    }

    const comment = await response.json();
    res.json({
      success: true,
      comment: {
        id: comment.id,
        url: comment.html_url
      }
    });

  } catch (error) {
    console.error('[GitHub Issues] Error assigning Copilot:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign Copilot',
      message: error.message
    });
  }
});

// Helper: Build structured issue body
function buildIssueBody({ type, description, context, suggestedFix, severity, component, environment, buildVersion, requestId }) {
  const timestamp = new Date().toISOString();
  const severityEmoji = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢'
  };

  let body = `## ${severityEmoji[severity] || '⚪'} Health Monitor Alert

**Type:** ${type.toUpperCase()}  
**Component:** ${component || 'Unknown'}  
**Severity:** ${severity || 'unknown'}  
**Detected:** ${timestamp}

---

## Problem Description

${description}

`;

  if (context && Object.keys(context).length > 0) {
    body += `## Diagnostic Context

\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`

`;
  }

  if (suggestedFix) {
    body += `## Suggested Fix

${suggestedFix}

`;
  }

  body += `---

## Action Items

- [ ] Review diagnostic information
- [ ] Implement suggested fix
- [ ] Add tests for regression prevention
- [ ] Deploy and verify fix in staging
- [ ] Update health monitoring if needed

---

## Monitoring Metadata

| Field | Value |
|-------|-------|
| Environment | ${environment} |
| Build Version | ${buildVersion} |
| Request ID | ${requestId} |
| Generated | ${timestamp} |

---

*🤖 This issue was automatically created by the AishaCRM Health Monitoring System.*  
*Source labels include environment + component for triage.*  
*For immediate assistance, review the suggested fix or contact the on-call engineer.*

`;

  return body;
}

// Helper: Build labels array (adds env/source/component)
function buildLabels(type, severity, component, environment) {
  const labels = ['bug', 'health-monitor', `env:${environment}`];
  labels.push('source:health-monitor');

  // Add type label
  if (type === 'api') labels.push('backend', 'api-endpoint');
  if (type === 'mcp') labels.push('mcp-server', 'ai');
  if (type === 'system') labels.push('infrastructure');

  // Add severity label
  if (severity === 'critical') labels.push('priority:critical', 'needs-immediate-attention');
  else if (severity === 'high') labels.push('priority:high');
  else if (severity === 'medium') labels.push('priority:medium');
  else if (severity === 'low') labels.push('priority:low');

  // Add component label if specified
  if (component) labels.push(`component:${component.toLowerCase()}`);

  return labels;
}

// Helper: Trigger Copilot review workflow (optional)
async function triggerCopilotReview(issueNumber) {
  try {
    // This would trigger a GitHub Actions workflow that assigns Copilot
    // For now, just log the intent
    console.log(`[GitHub Issues] Would trigger Copilot review for issue #${issueNumber}`);
    // Future: Implement workflow_dispatch API call
  } catch (error) {
    console.error('[GitHub Issues] Error triggering Copilot review:', error);
  }
}

export default router;
