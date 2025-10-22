/**
 * getPerformanceMetrics
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();

    const { timeRange = '24h' } = await req.json();
    
    const now = new Date();
    let startDate = new Date();

    switch (timeRange) {
        case '1h':
            startDate.setHours(now.getHours() - 1);
            break;
        case '7d':
            startDate.setDate(now.getDate() - 7);
            break;
        case '30d':
            startDate.setDate(now.getDate() - 30);
            break;
        case '24h':
        default:
            startDate.setDate(now.getDate() - 1);
            break;
    }

    const filter = {
      created_date: { '$gte': startDate.toISOString() }
    };
    
    // Removed the incorrect tenantId filtering
    const logs = await base44.asServiceRole.entities.PerformanceLog.filter(filter, '-created_date', 10000);

    if (logs.length === 0) {
        return Response.json({
            avgApiResponseTime: 0,
            avgFunctionTime: 0,
            avgQueryTime: 0,
            errorRate: 0,
            apiResponseTimeTrend: 0,
            functionTimeTrend: 0,
            queryTimeTrend: 0,
            errorRateTrend: 0,
            responseTimeHistory: [],
            throughputHistory: [],
            errorsByType: [],
            recentErrors: [],
            functionMetrics: [],
            tenantMetrics: []
        }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    // --- Calculations ---
    const successfulLogs = logs.filter(l => l.status === 'success');
    const errorLogs = logs.filter(l => l.status === 'error');

    const avgApiResponseTime = successfulLogs.length > 0
        ? successfulLogs.reduce((acc, log) => acc + log.response_time_ms, 0) / successfulLogs.length
        : 0;

    const errorRate = logs.length > 0 ? (errorLogs.length / logs.length) * 100 : 0;
    
    // Dummy data for other metrics as they require more complex logging not yet implemented
    const avgFunctionTime = avgApiResponseTime * 0.7; 
    const avgQueryTime = avgApiResponseTime * 0.3;

    // --- Chart Data ---
    const responseTimeHistory = logs.map(log => ({
        timestamp: new Date(log.created_date).toLocaleTimeString(),
        avgResponseTime: log.response_time_ms,
        p95ResponseTime: log.response_time_ms * 1.5, // Placeholder
    })).reverse();
    
    const recentErrors = errorLogs.slice(0, 5).map(log => ({
        message: log.error_message || 'Unknown error',
        timestamp: new Date(log.created_date).toLocaleString(),
        function: log.function_name,
    }));
    
    // Aggregate function metrics
    const funcMetricsMap = new Map();
    logs.forEach(log => {
        const entry = funcMetricsMap.get(log.function_name) || { name: log.function_name, executionCount: 0, totalDuration: 0 };
        entry.executionCount++;
        entry.totalDuration += log.response_time_ms;
        funcMetricsMap.set(log.function_name, entry);
    });

    const functionMetrics = Array.from(funcMetricsMap.values())
        .map(f => ({ ...f, avgDuration: Math.round(f.totalDuration / f.executionCount) }))
        .sort((a,b) => b.avgDuration - a.avgDuration)
        .slice(0, 5);
    
    const response = {
        avgApiResponseTime: Math.round(avgApiResponseTime),
        avgFunctionTime: Math.round(avgFunctionTime),
        avgQueryTime: Math.round(avgQueryTime),
        errorRate: parseFloat(errorRate.toFixed(2)),
        apiResponseTimeTrend: Math.random() > 0.5 ? 5 : -5, // Placeholder
        functionTimeTrend: Math.random() > 0.5 ? 3 : -3, // Placeholder
        queryTimeTrend: Math.random() > 0.5 ? 8 : -8, // Placeholder
        errorRateTrend: Math.random() > 0.5 ? -2 : 2, // Placeholder
        responseTimeHistory,
        throughputHistory: responseTimeHistory.map(d => ({ timestamp: d.timestamp, requestsPerMinute: Math.floor(Math.random() * 100) })), // Placeholder
        errorsByType: [{ errorType: '500', count: errorLogs.length }, { errorType: '401', count: 0 }], // Placeholder
        recentErrors,
        functionMetrics,
        tenantMetrics: [{ name: 'Default Tenant', activeUsers: 1, requestCount: logs.length }] // Placeholder
    };

    return Response.json(response, { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});

  } catch (error) {
    console.error(`Error in getPerformanceMetrics: ${error.message}`);
    return Response.json({ error: 'Failed to fetch performance metrics', details: error.message }, { status: 500, headers: corsHeaders });
  }
});

----------------------------

export default getPerformanceMetrics;
