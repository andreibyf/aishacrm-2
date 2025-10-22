/**
 * runFullSystemDiagnostics
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const user = await base44.auth.me();
    if (user.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        console.log("🚀 Starting comprehensive system diagnostics...");
        
        // 1. Run component tests
        console.log("📋 Running component tests...");
        const componentTestResults = await base44.functions.invoke('runComponentTests', {});
        
        // 2. Check backend status
        console.log("🔍 Checking backend status...");
        let backendStatus;
        try {
            backendStatus = await base44.functions.invoke('checkBackendStatus', {});
        } catch (error) {
            backendStatus = { status: 500, data: { overall_status: 'error', error: error.message } };
        }
        
        // 3. Test critical paths
        console.log("🛣️ Testing critical user paths...");
        const criticalPaths = [];
        
        // Test Contact CRUD
        try {
            const testContact = await base44.asServiceRole.entities.Contact.create({
                first_name: 'System',
                last_name: 'Test',
                email: `systemtest.${Date.now()}@diagnostic.test`,
                tenant_id: user.tenant_id,
                is_test_data: true
            });
            await base44.asServiceRole.entities.Contact.delete(testContact.id);
            criticalPaths.push({ path: 'Contact CRUD', status: 'success' });
        } catch (error) {
            criticalPaths.push({ path: 'Contact CRUD', status: 'error', error: error.message });
        }
        
        // Test Account CRUD
        try {
            const testAccount = await base44.asServiceRole.entities.Account.create({
                name: `System Test Account ${Date.now()}`,
                tenant_id: user.tenant_id,
                is_test_data: true
            });
            await base44.asServiceRole.entities.Account.delete(testAccount.id);
            criticalPaths.push({ path: 'Account CRUD', status: 'success' });
        } catch (error) {
            criticalPaths.push({ path: 'Account CRUD', status: 'error', error: error.message });
        }
        
        // Test Lead CRUD
        try {
            const testLead = await base44.asServiceRole.entities.Lead.create({
                first_name: 'System',
                last_name: 'Test',
                email: `systemtest.lead.${Date.now()}@diagnostic.test`,
                tenant_id: user.tenant_id,
                is_test_data: true
            });
            await base44.asServiceRole.entities.Lead.delete(testLead.id);
            criticalPaths.push({ path: 'Lead CRUD', status: 'success' });
        } catch (error) {
            criticalPaths.push({ path: 'Lead CRUD', status: 'error', error: error.message });
        }
        
        // 4. Performance metrics
        console.log("⚡ Collecting performance metrics...");
        const performanceMetrics = {
            timestamp: new Date().toISOString(),
            memory_usage: process.memoryUsage ? process.memoryUsage() : null,
            uptime: performance.now ? performance.now() : null
        };
        
        // 5. Data volume check
        console.log("📊 Checking data volumes...");
        const dataVolumes = {};
        const entities = ['Contact', 'Account', 'Lead', 'Opportunity', 'Activity'];
        
        for (const entity of entities) {
            try {
                const count = await base44.asServiceRole.entities[entity].filter({ tenant_id: user.tenant_id });
                dataVolumes[entity] = count.length;
            } catch (error) {
                dataVolumes[entity] = { error: error.message };
            }
        }
        
        // Compile final report
        const diagnosticsReport = {
            status: 'success',
            timestamp: new Date().toISOString(),
            component_tests: componentTestResults.data || componentTestResults,
            backend_status: backendStatus.data || backendStatus,
            critical_paths: criticalPaths,
            performance_metrics: performanceMetrics,
            data_volumes: dataVolumes,
            overall_health: {
                components: componentTestResults.status === 200 ? 'healthy' : 'degraded',
                backend: backendStatus.status === 200 ? 'healthy' : 'degraded',
                critical_paths: criticalPaths.every(p => p.status === 'success') ? 'healthy' : 'degraded'
            }
        };
        
        // Store diagnostic report
        try {
            await base44.asServiceRole.entities.TestReport.create({
                test_date: new Date().toISOString(),
                status: 'Completed',
                report_data: { diagnostic_type: 'full_system', ...diagnosticsReport },
                triggered_by: user.email
            });
        } catch (error) {
            console.warn('Could not store diagnostic report:', error);
        }
        
        console.log("✅ System diagnostics completed successfully");
        
        return new Response(JSON.stringify(diagnosticsReport), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('❌ System diagnostics failed:', error);
        
        return new Response(JSON.stringify({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default runFullSystemDiagnostics;
