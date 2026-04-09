/**
 * Phase 2 OpenAPI Coverage
 *
 * This file documents route groups that previously lacked inline @openapi
 * annotations in their route source files.
 *
 * @openapi
 * /api/agent-office/roles:
 *   get:
 *     summary: List available agent office roles
 *     tags: [agent-office]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Roles list
 *
 * /api/agent-office/agents:
 *   get:
 *     summary: List registered agents
 *     tags: [agent-office]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agents list
 *
 * /api/agent-office/agents/{role}:
 *   get:
 *     summary: Get agent details by role
 *     tags: [agent-office]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Agent details
 *
 * /api/agent-office/run:
 *   post:
 *     summary: Execute agent office run request
 *     tags: [agent-office]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Run result
 *
 * /api/aicampaigns:
 *   get:
 *     summary: List AI campaigns
 *     tags: [aicampaigns]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Campaign list
 *   post:
 *     summary: Create AI campaign
 *     tags: [aicampaigns]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       201:
 *         description: Campaign created
 *
 * /api/aicampaigns/{id}:
 *   get:
 *     summary: Get AI campaign by ID
 *     tags: [aicampaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Campaign details
 *   put:
 *     summary: Update AI campaign
 *     tags: [aicampaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Campaign updated
 *   delete:
 *     summary: Delete AI campaign
 *     tags: [aicampaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Campaign deleted
 *
 * /api/aicampaigns/{id}/start:
 *   post:
 *     summary: Start campaign execution
 *     tags: [aicampaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Campaign started
 *
 * /api/aicampaigns/{id}/pause:
 *   post:
 *     summary: Pause campaign execution
 *     tags: [aicampaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Campaign paused
 *
 * /api/aicampaigns/{id}/resume:
 *   post:
 *     summary: Resume campaign execution
 *     tags: [aicampaigns]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Campaign resumed
 *
 * /api/ai/summarize-person-profile:
 *   post:
 *     summary: Generate AI profile summary for a person entity
 *     tags: [ai]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Summary generated
 *
 * /api/billing/usage:
 *   get:
 *     summary: Get billing usage overview
 *     tags: [billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usage metrics
 *
 * /api/billing/invoices:
 *   get:
 *     summary: List invoices
 *     tags: [billing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Invoice list
 *
 * /api/billing/create-invoice:
 *   post:
 *     summary: Create invoice
 *     tags: [billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Invoice created
 *
 * /api/billing/process-payment:
 *   post:
 *     summary: Process billing payment
 *     tags: [billing]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Payment processed
 *
 * /api/analytics/bookings:
 *   get:
 *     summary: Get booking analytics metrics
 *     tags: [analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Booking analytics
 *
 * /api/analytics/packages:
 *   get:
 *     summary: Get session package analytics
 *     tags: [analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Package analytics
 *
 * /api/analytics/credits-utilization:
 *   get:
 *     summary: Get credits utilization analytics
 *     tags: [analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Credit utilization analytics
 *
 * /api/scheduling/shortlink:
 *   post:
 *     summary: Create short booking redirect link
 *     tags: [shortlinks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Short link created
 *
 * /book/{token}:
 *   get:
 *     summary: Resolve and redirect booking shortlink
 *     tags: [shortlinks]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       302:
 *         description: Redirect to validated scheduler URL
 *       404:
 *         description: Link not found or expired
 *
 * /api/braid/audit:
 *   get:
 *     summary: List Braid audit entries
 *     tags: [braid-audit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit entries
 *
 * /api/braid/audit/stats:
 *   get:
 *     summary: Get Braid audit stats
 *     tags: [braid-audit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit stats
 *
 * /api/braid/audit/tools:
 *   get:
 *     summary: Get Braid tool usage audit
 *     tags: [braid-audit]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tool usage stats
 *
 * /api/braid/audit/user/{userId}:
 *   get:
 *     summary: Get Braid audit entries for one user
 *     tags: [braid-audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: User audit entries
 *
 * /api/braid/chain:
 *   get:
 *     summary: List available Braid chains
 *     tags: [braid-chain]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chain list
 *
 * /api/braid/chain/{chainName}:
 *   get:
 *     summary: Get chain definition/details
 *     tags: [braid-chain]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chain details
 *
 * /api/braid/chain/{chainName}/validate:
 *   post:
 *     summary: Validate tool chain inputs
 *     tags: [braid-chain]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Validation result
 *
 * /api/braid/chain/{chainName}/execute:
 *   post:
 *     summary: Execute tool chain
 *     tags: [braid-chain]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Execution result
 *
 * /api/braid/chain/{chainName}/dry-run:
 *   post:
 *     summary: Simulate tool chain without mutating state
 *     tags: [braid-chain]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chainName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Dry-run result
 *
 * /api/braid/graph:
 *   get:
 *     summary: Get Braid tool dependency graph
 *     tags: [braid-graph]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Graph data
 *
 * /api/braid/graph/categories:
 *   get:
 *     summary: List graph categories
 *     tags: [braid-graph]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Categories
 *
 * /api/braid/graph/tool/{toolName}:
 *   get:
 *     summary: Get tool node details
 *     tags: [braid-graph]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: toolName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Tool node
 *
 * /api/braid/graph/tool/{toolName}/impact:
 *   get:
 *     summary: Get tool impact analysis
 *     tags: [braid-graph]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: toolName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Impact analysis
 *
 * /api/braid/graph/dependencies/{toolName}:
 *   get:
 *     summary: List upstream dependencies
 *     tags: [braid-graph]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: toolName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Dependencies
 *
 * /api/braid/graph/dependents/{toolName}:
 *   get:
 *     summary: List downstream dependents
 *     tags: [braid-graph]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: toolName
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Dependents
 *
 * /api/braid/graph/validate:
 *   get:
 *     summary: Validate graph consistency
 *     tags: [braid-graph]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Validation report
 *
 * /api/braid/graph/path/{from}/{to}:
 *   get:
 *     summary: Find dependency path between tools
 *     tags: [braid-graph]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: from
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: to
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Graph path result
 *
 * /api/braid/graph/effects/{effect}:
 *   get:
 *     summary: List tools by effect category
 *     tags: [braid-graph]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: effect
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Tool list
 *
 * /api/braid/metrics/realtime:
 *   get:
 *     summary: Get realtime Braid metrics
 *     tags: [braid-metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Realtime metrics
 *
 * /api/braid/metrics/tools:
 *   get:
 *     summary: Get per-tool metrics
 *     tags: [braid-metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tool metrics
 *
 * /api/braid/metrics/timeseries:
 *   get:
 *     summary: Get timeseries metrics
 *     tags: [braid-metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Timeseries data
 *
 * /api/braid/metrics/errors:
 *   get:
 *     summary: Get error metrics
 *     tags: [braid-metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Error metrics
 *
 * /api/braid/metrics/summary:
 *   get:
 *     summary: Get aggregate Braid metrics summary
 *     tags: [braid-metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Metrics summary
 *
 * /api/bundles/leads:
 *   get:
 *     summary: Get bundled payload for leads page
 *     tags: [bundles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Leads bundle
 *
 * /api/bundles/contacts:
 *   get:
 *     summary: Get bundled payload for contacts page
 *     tags: [bundles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contacts bundle
 *
 * /api/bundles/opportunities:
 *   get:
 *     summary: Get bundled payload for opportunities page
 *     tags: [bundles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Opportunities bundle
 *
 * /api/cache/invalidate:
 *   post:
 *     summary: Invalidate cache by key/pattern
 *     tags: [cache]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Cache invalidation result
 *
 * /api/calcom-sync/status:
 *   get:
 *     summary: Get Cal.com sync status
 *     tags: [calcom-sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync status
 *
 * /api/calcom-sync/trigger:
 *   post:
 *     summary: Trigger Cal.com synchronization
 *     tags: [calcom-sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync triggered
 *
 * /api/calcom-sync/resolve-link:
 *   get:
 *     summary: Resolve scheduler link for entity
 *     tags: [calcom-sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Link resolution result
 *
 * /api/calcom-sync/validate-link:
 *   get:
 *     summary: Validate scheduler link
 *     tags: [calcom-sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Validation result
 *
 * /api/calcom-sync/lookup-user:
 *   get:
 *     summary: Lookup scheduler user linkage
 *     tags: [calcom-sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User lookup result
 *
 * /api/calcom-sync/import-personal-calendar:
 *   get:
 *     summary: Import external personal calendar into scheduler context
 *     tags: [calcom-sync]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Import result
 *
 * /api/webhooks/calcom:
 *   post:
 *     summary: Receive Cal.com webhook events
 *     tags: [webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Event accepted
 *
 * /api/webhooks/stripe:
 *   post:
 *     summary: Receive Stripe webhook events
 *     tags: [webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Event processed
 *
 * /api/care-config:
 *   get:
 *     summary: Get CARE config for tenant
 *     tags: [care-config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CARE config
 *   put:
 *     summary: Update CARE config
 *     tags: [care-config]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: CARE config updated
 *   delete:
 *     summary: Reset CARE config for tenant
 *     tags: [care-config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CARE config reset
 *
 * /api/care-config/workflows:
 *   get:
 *     summary: Get CARE workflow configuration metadata
 *     tags: [care-config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CARE workflows metadata
 *
 * /api/cashflow:
 *   get:
 *     summary: List cashflow entries
 *     tags: [cashflow]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cashflow list
 *   post:
 *     summary: Create cashflow entry
 *     tags: [cashflow]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       201:
 *         description: Cashflow entry created
 *
 * /api/cashflow/{id}:
 *   get:
 *     summary: Get cashflow entry by ID
 *     tags: [cashflow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Cashflow entry details
 *   put:
 *     summary: Update cashflow entry
 *     tags: [cashflow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Cashflow entry updated
 *   delete:
 *     summary: Delete cashflow entry
 *     tags: [cashflow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Cashflow entry deleted
 *
 * /api/cashflow/summary:
 *   get:
 *     summary: Get cashflow summary metrics
 *     tags: [cashflow]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cashflow summary
 *
 * /api/cron/jobs:
 *   get:
 *     summary: List cron jobs
 *     tags: [cron]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cron jobs
 *   post:
 *     summary: Create cron job
 *     tags: [cron]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       201:
 *         description: Job created
 *
 * /api/cron/jobs/{id}:
 *   get:
 *     summary: Get cron job by ID
 *     tags: [cron]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Job details
 *   put:
 *     summary: Update cron job
 *     tags: [cron]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Job updated
 *   delete:
 *     summary: Delete cron job
 *     tags: [cron]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Job deleted
 *
 * /api/cron/run:
 *   post:
 *     summary: Run due cron jobs now
 *     tags: [cron]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Run trigger result
 *
 * /api/cron/jobs/{id}/run:
 *   post:
 *     summary: Run one cron job now
 *     tags: [cron]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Job run result
 *
 * /api/database/run-migration:
 *   post:
 *     summary: Execute migration helper actions
 *     tags: [database]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Migration command result
 *
 * /api/database/sync:
 *   post:
 *     summary: Synchronize database structures/checks
 *     tags: [database]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync result
 *
 * /api/database/check-volume:
 *   get:
 *     summary: Check DB storage and record volume
 *     tags: [database]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Volume check
 *
 * /api/database/archive-aged-data:
 *   post:
 *     summary: Archive aged tenant data
 *     tags: [database]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Archive result
 *
 * /api/database/cleanup-orphaned-data:
 *   post:
 *     summary: Cleanup orphaned database records
 *     tags: [database]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cleanup result
 *
 * /api/database/nuclear-cleanup:
 *   post:
 *     summary: Perform full emergency cleanup operation
 *     tags: [database]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cleanup completed
 *
 * /api/devai/health-alerts:
 *   get:
 *     summary: List Developer AI health alerts
 *     tags: [devai]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health alerts
 *
 * /api/devai/health-stats:
 *   get:
 *     summary: Get Developer AI health statistics
 *     tags: [devai]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health stats
 *
 * /api/devai/health-alerts/{id}/resolve:
 *   post:
 *     summary: Resolve Developer AI health alert
 *     tags: [devai]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Alert resolved
 *
 * /api/devai/health-alerts/{id}/mark-false-positive:
 *   post:
 *     summary: Mark alert as false positive
 *     tags: [devai]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Alert updated
 *
 * /api/devai/trigger-health-check:
 *   post:
 *     summary: Trigger health-check pipeline
 *     tags: [devai]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Health check queued
 *
 * /api/devai/health-alerts/{id}:
 *   delete:
 *     summary: Delete health alert record
 *     tags: [devai]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Alert deleted
 *
 * /api/documentation:
 *   get:
 *     summary: Get generated in-app documentation sections
 *     tags: [documentation]
 *     responses:
 *       200:
 *         description: Documentation payload
 *
 * /api/documentation/user-guide.pdf:
 *   get:
 *     summary: Download generated user guide PDF
 *     tags: [documentation]
 *     responses:
 *       200:
 *         description: PDF stream
 *
 * /api/documentationfiles:
 *   get:
 *     summary: List documentation files
 *     tags: [documentation-files]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: File list
 *   post:
 *     summary: Create documentation file
 *     tags: [documentation-files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       201:
 *         description: File created
 *
 * /api/documentationfiles/deletion-history:
 *   get:
 *     summary: List deleted documentation files history
 *     tags: [documentation-files]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deletion history
 *
 * /api/documentationfiles/{id}:
 *   get:
 *     summary: Get documentation file by ID
 *     tags: [documentation-files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: File details
 *   put:
 *     summary: Update documentation file
 *     tags: [documentation-files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: File updated
 *   delete:
 *     summary: Delete documentation file
 *     tags: [documentation-files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: File deleted
 *
 * /api/edge/mint-lead-link:
 *   get:
 *     summary: Mint signed edge-link for lead capture/profile context
 *     tags: [edge]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Signed link payload
 *
 * /api/edge/person-profile:
 *   get:
 *     summary: Get person profile via edge-function adapter
 *     tags: [edge]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Person profile payload
 *
 * /api/edge/person-profile/{id}:
 *   get:
 *     summary: Get person profile by ID via edge-function adapter
 *     tags: [edge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Person profile payload
 *
 * /api/edge/person-refresh/{id}:
 *   post:
 *     summary: Trigger person profile refresh
 *     tags: [edge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Refresh queued
 *
 * /api/v2/email-templates:
 *   get:
 *     summary: List email templates (v2)
 *     tags: [email-templates-v2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Template list
 *   post:
 *     summary: Create email template (v2)
 *     tags: [email-templates-v2]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Template created
 *
 * /api/v2/email-templates/{id}:
 *   get:
 *     summary: Get email template by ID (v2)
 *     tags: [email-templates-v2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Template details
 *   put:
 *     summary: Update email template (v2)
 *     tags: [email-templates-v2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Template updated
 *   delete:
 *     summary: Delete email template (v2)
 *     tags: [email-templates-v2]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Template deleted
 *
 * /api/github-issues/create-health-issue:
 *   post:
 *     summary: Create GitHub issue from health alert
 *     tags: [github-issues]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Issue created
 *
 * /api/github-issues/assign-copilot:
 *   post:
 *     summary: Assign GitHub Copilot to issue
 *     tags: [github-issues]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Copilot assignment initiated
 *
 * /api/internal/communications/inbound:
 *   post:
 *     summary: Inbound communications webhook endpoint
 *     tags: [internal-communications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Inbound event processed
 *
 * /api/internal/communications/outbound:
 *   post:
 *     summary: Record outbound communication event
 *     tags: [internal-communications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Outbound event processed
 *
 * /api/internal/communications/threads/replay:
 *   post:
 *     summary: Replay communication thread event sequence
 *     tags: [internal-communications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Replay accepted
 *
 * /api/internal/communications/health:
 *   get:
 *     summary: Health check for internal communications pipeline
 *     tags: [internal-communications]
 *     responses:
 *       200:
 *         description: Service health
 *
 * /api/memory/status:
 *   get:
 *     summary: Get memory service status
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Memory service status
 *
 * /api/memory/search:
 *   get:
 *     summary: Search memory events
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Search results
 *
 * /api/memory/sessions:
 *   get:
 *     summary: List memory sessions
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sessions list
 *   post:
 *     summary: Create memory session
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Session created
 *
 * /api/memory/sessions/{sessionId}:
 *   get:
 *     summary: Get memory session by ID
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session details
 *   delete:
 *     summary: Delete memory session
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session deleted
 *
 * /api/memory/sessions/{sessionId}/events:
 *   get:
 *     summary: List session memory events
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Event list
 *   post:
 *     summary: Append memory event to session
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Event appended
 *
 * /api/memory/events/recent:
 *   get:
 *     summary: Get recent memory events across sessions
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recent events
 *
 * /api/memory/preferences:
 *   get:
 *     summary: Get memory preferences
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences
 *   post:
 *     summary: Upsert memory preferences
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences updated
 *   delete:
 *     summary: Delete memory preferences
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences deleted
 *
 * /api/memory/navigation:
 *   get:
 *     summary: Get navigation memory state
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Navigation state
 *   post:
 *     summary: Record navigation memory event
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Navigation event recorded
 *
 * /api/memory/archive/sessions/{sessionId}:
 *   post:
 *     summary: Archive one memory session
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session archived
 *
 * /api/memory/archive/run:
 *   post:
 *     summary: Run archive policy over memory store
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Archive run completed
 *
 * /api/memory/flush-all:
 *   post:
 *     summary: Flush all memory data
 *     tags: [memory]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Memory flushed
 *
 * /api/metrics/performance:
 *   get:
 *     summary: Get performance metrics
 *     tags: [metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance metrics
 *   delete:
 *     summary: Clear performance metrics
 *     tags: [metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Metrics cleared
 *
 * /api/metrics/usage:
 *   get:
 *     summary: Get usage metrics
 *     tags: [metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usage metrics
 *
 * /api/metrics/perf-log-status:
 *   get:
 *     summary: Get perf log pipeline status
 *     tags: [metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pipeline status
 *
 * /api/metrics/flush-performance-logs:
 *   post:
 *     summary: Flush buffered performance logs
 *     tags: [metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logs flushed
 *
 * /api/metrics/security:
 *   get:
 *     summary: Get security metrics
 *     tags: [metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Security metrics
 *
 * /api/pep/compile:
 *   post:
 *     summary: Compile PEP query to execution plan
 *     tags: [pep]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Compilation result
 *
 * /api/pep/query:
 *   post:
 *     summary: Execute PEP query
 *     tags: [pep]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Query result
 *
 * /api/pep/saved-reports:
 *   get:
 *     summary: List saved PEP reports
 *     tags: [pep]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Saved reports
 *   post:
 *     summary: Create saved PEP report
 *     tags: [pep]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Saved report created
 *
 * /api/pep/saved-reports/{id}:
 *   delete:
 *     summary: Delete saved PEP report
 *     tags: [pep]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Saved report deleted
 *
 * /api/pep/saved-reports/{id}/run:
 *   patch:
 *     summary: Execute saved PEP report
 *     tags: [pep]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Saved report run result
 *
 * /api/security/status:
 *   get:
 *     summary: Get security posture status
 *     tags: [security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Security status
 *
 * /api/security/policies:
 *   get:
 *     summary: List active security policies
 *     tags: [security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy list
 *
 * /api/security/alerts:
 *   get:
 *     summary: List security alerts
 *     tags: [security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Alerts
 *
 * /api/security/statistics:
 *   get:
 *     summary: Get security statistics
 *     tags: [security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Security statistics
 *
 * /api/security/emergency-unblock:
 *   post:
 *     summary: Emergency unblock for user/IP lockout scenarios
 *     tags: [security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Emergency unblock result
 *
 * /api/security/block-ip:
 *   post:
 *     summary: Block an IP address
 *     tags: [security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: IP blocked
 *
 * /api/security/unblock-ip:
 *   post:
 *     summary: Unblock an IP address
 *     tags: [security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: IP unblocked
 *
 * /api/security/threat-intelligence:
 *   get:
 *     summary: Retrieve threat intelligence insights
 *     tags: [security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Threat intelligence payload
 *
 * /api/security/clear-tracking:
 *   delete:
 *     summary: Clear tracked security event data
 *     tags: [security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Tracking data cleared
 *
 * /api/session-credits:
 *   get:
 *     summary: List session credit balances
 *     tags: [session-credits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Credits list
 *
 * /api/session-credits/bookings:
 *   get:
 *     summary: List booking usage against credits
 *     tags: [session-credits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Booking usage list
 *
 * /api/session-credits/purchase:
 *   post:
 *     summary: Purchase session credits directly
 *     tags: [session-credits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Purchase completed
 *
 * /api/session-credits/checkout:
 *   post:
 *     summary: Start checkout session for credits
 *     tags: [session-credits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Checkout started
 *
 * /api/session-credits/expiring:
 *   get:
 *     summary: List expiring credits
 *     tags: [session-credits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Expiring credits
 *
 * /api/session-credits/extend:
 *   post:
 *     summary: Extend credit expiration
 *     tags: [session-credits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Credits extended
 *
 * /api/session-credits/grant:
 *   post:
 *     summary: Grant promotional/manual credits
 *     tags: [session-credits]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Credits granted
 *
 * /api/session-packages:
 *   post:
 *     summary: Create session package
 *     tags: [session-packages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Package created
 *
 * /api/session-packages/{id}:
 *   get:
 *     summary: Get session package by ID
 *     tags: [session-packages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Package details
 *   put:
 *     summary: Update session package
 *     tags: [session-packages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Package updated
 *   delete:
 *     summary: Delete session package
 *     tags: [session-packages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Package deleted
 *
 * /api/supabase-proxy/auth/user:
 *   get:
 *     summary: Proxy current Supabase auth user
 *     tags: [supabase-proxy]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Auth user payload
 *
 * /api/synchealths:
 *   get:
 *     summary: List sync health checks
 *     tags: [synchealths]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sync health list
 *   post:
 *     summary: Create sync health check
 *     tags: [synchealths]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Sync health created
 *
 * /api/synchealths/{id}:
 *   get:
 *     summary: Get sync health by ID
 *     tags: [synchealths]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Sync health details
 *   put:
 *     summary: Update sync health
 *     tags: [synchealths]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Sync health updated
 *   delete:
 *     summary: Delete sync health
 *     tags: [synchealths]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Sync health deleted
 *
 * /api/systembrandings:
 *   get:
 *     summary: List system branding profiles
 *     tags: [systembrandings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Branding list
 *   post:
 *     summary: Create system branding profile
 *     tags: [systembrandings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Branding created
 *
 * /api/systembrandings/{id}:
 *   get:
 *     summary: Get branding profile by ID
 *     tags: [systembrandings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Branding details
 *   put:
 *     summary: Update branding profile
 *     tags: [systembrandings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Branding updated
 *   delete:
 *     summary: Delete branding profile
 *     tags: [systembrandings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Branding deleted
 *
 * /api/system-settings:
 *   get:
 *     summary: Get tenant/system settings
 *     tags: [system-settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings payload
 *   put:
 *     summary: Update tenant/system settings
 *     tags: [system-settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: Settings updated
 *
 * /api/tenantintegrations:
 *   get:
 *     summary: List tenant integrations
 *     tags: [tenant-integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Integration list
 *   post:
 *     summary: Create tenant integration
 *     tags: [tenant-integrations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Integration created
 *
 * /api/tenantintegrations/{id}:
 *   get:
 *     summary: Get tenant integration by ID
 *     tags: [tenant-integrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Integration details
 *   put:
 *     summary: Update tenant integration
 *     tags: [tenant-integrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Integration updated
 *   delete:
 *     summary: Delete tenant integration
 *     tags: [tenant-integrations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Integration deleted
 *
 * /api/tenantresolve:
 *   get:
 *     summary: Resolve tenant by host/identifier
 *     tags: [tenant-resolve]
 *     responses:
 *       200:
 *         description: Tenant resolution result
 *
 * /api/tenantresolve/{identifier}:
 *   get:
 *     summary: Resolve tenant by explicit identifier
 *     tags: [tenant-resolve]
 *     parameters:
 *       - in: path
 *         name: identifier
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Tenant resolution details
 *
 * /api/tenantresolve/metrics:
 *   get:
 *     summary: Get tenant resolver cache/usage metrics
 *     tags: [tenant-resolve]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resolver metrics
 *
 * /api/tenantresolve/reset:
 *   post:
 *     summary: Reset tenant resolver caches
 *     tags: [tenant-resolve]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resolver reset result
 *
 * /api/testing/ping:
 *   get:
 *     summary: Testing ping endpoint
 *     tags: [testing]
 *     responses:
 *       200:
 *         description: Pong response
 *
 * /api/testing/suites:
 *   get:
 *     summary: List available test suites
 *     tags: [testing]
 *     responses:
 *       200:
 *         description: Test suite list
 *
 * /api/testing/mock-data:
 *   post:
 *     summary: Seed mock data for testing
 *     tags: [testing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mock data seeded
 *
 * /api/testing/trigger-e2e:
 *   post:
 *     summary: Trigger E2E test workflow
 *     tags: [testing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: E2E trigger accepted
 *
 * /api/testing/run-playwright:
 *   post:
 *     summary: Run Playwright suite from API helper
 *     tags: [testing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Playwright run accepted
 *
 * /api/testing/workflow-status:
 *   get:
 *     summary: Get status of background test workflow
 *     tags: [testing]
 *     responses:
 *       200:
 *         description: Workflow status
 *
 * /api/testing/cleanup-test-data:
 *   post:
 *     summary: Cleanup test data artifacts
 *     tags: [testing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cleanup complete
 *
 * /api/testing/full-scan:
 *   get:
 *     summary: Execute broad testing scan report
 *     tags: [testing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Scan result
 *
 * /api/testing/trigger-error-500:
 *   post:
 *     summary: Trigger synthetic 500 error for observability tests
 *     tags: [testing]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       500:
 *         description: Intentional failure
 *
 * /api/testing/playbook-seeding:
 *   get:
 *     summary: Validate playbook seed setup
 *     tags: [testing]
 *     responses:
 *       200:
 *         description: Seeding diagnostics
 *
 * /api/utils/health:
 *   get:
 *     summary: Utility route health check
 *     tags: [utils]
 *     responses:
 *       200:
 *         description: Utilities healthy
 *
 * /api/utils/hash:
 *   post:
 *     summary: Generate secure hash utility output
 *     tags: [utils]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hash output
 *
 * /api/utils/generate-uuid:
 *   post:
 *     summary: Generate UUID
 *     tags: [utils]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: UUID generated
 *
 * /api/utils/generate-unique-id:
 *   post:
 *     summary: Generate prefixed unique identifier
 *     tags: [utils]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unique ID generated
 *
 * /api/validation/check-duplicate:
 *   get:
 *     summary: Check if a record appears duplicated
 *     tags: [validation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Duplicate check result
 *
 * /api/validation/find-duplicates:
 *   post:
 *     summary: Find duplicates for entity dataset
 *     tags: [validation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Duplicate candidates
 *
 * /api/validation/analyze-data-quality:
 *   post:
 *     summary: Analyze quality issues in import/records
 *     tags: [validation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data-quality report
 *
 * /api/validation/validate-record:
 *   post:
 *     summary: Validate one record before persistence
 *     tags: [validation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Validation result
 *
 * /api/validation/check-duplicate-before-create:
 *   post:
 *     summary: Pre-create duplicate safety check
 *     tags: [validation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Duplicate safety result
 *
 * /api/validation/validate-and-import:
 *   post:
 *     summary: Validate and import batched records
 *     tags: [validation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Import result
 *
 * /api/workflowexecutions:
 *   get:
 *     summary: List workflow execution records
 *     tags: [workflowexecutions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workflow execution list
 */

export {};
