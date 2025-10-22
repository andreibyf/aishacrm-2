/**
 * exportReportToCSV
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

// Helper function to safely escape values for CSV format
const escapeCsvValue = (value) => {
    const stringValue = String(value === null || value === undefined ? '' : value);
    // If the value contains a comma, double quote, or newline, wrap it in double quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        // Within a double-quoted string, any double quote must be escaped by another double quote
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
};

// Fetches and prepares data for a specific report type
async function getReportData(base44, reportType, tenantFilter) {
    const filter = tenantFilter || {};
    let records = [];
    let headers = [];

    const clean = (val) => val || ''; // Simple cleaner for CSV

    console.log('Export reportType:', reportType); // Debug log

    switch (reportType) {
        case 'sales':
            console.log('Exporting sales data');
            records = await base44.entities.Opportunity.filter(filter);
            headers = ["Opportunity Name", "Stage", "Amount", "Probability (%)", "Close Date", "Account", "Contact", "Assigned To"];
            return {
                headers,
                rows: records.map(r => [
                    clean(r.name),
                    clean(r.stage),
                    clean(r.amount ? `$${Number(r.amount).toLocaleString()}` : '$0'),
                    clean(r.probability || '0'),
                    clean(r.close_date),
                    clean(r.account_id),
                    clean(r.contact_id),
                    clean(r.assigned_to)
                ])
            };

        case 'leads':
            console.log('Exporting leads data');
            records = await base44.entities.Lead.filter(filter);
            headers = ["First Name", "Last Name", "Company", "Email", "Phone", "Status", "Source", "Score", "Assigned To", "Created Date"];
            return {
                headers,
                rows: records.map(r => [
                    clean(r.first_name),
                    clean(r.last_name),
                    clean(r.company),
                    clean(r.email),
                    clean(r.phone),
                    clean(r.status),
                    clean(r.source),
                    clean(r.score || '0'),
                    clean(r.assigned_to),
                    clean(r.created_date)
                ])
            };

        case 'productivity':
            console.log('Exporting productivity data');
            records = await base44.entities.Activity.filter(filter);
            headers = ["Subject", "Type", "Status", "Priority", "Due Date", "Assigned To", "Related To", "Created Date"];
            return {
                headers,
                rows: records.map(r => [
                    clean(r.subject),
                    clean(r.type),
                    clean(r.status),
                    clean(r.priority),
                    clean(r.due_date),
                    clean(r.assigned_to),
                    clean(r.related_to ? `${r.related_to}: ${r.related_id}` : ''),
                    clean(r.created_date)
                ])
            };

        case 'trends':
            console.log('Exporting trends data - using overview format');
            const [trendsContacts, trendsAccounts, trendsLeads, trendsOpportunities, trendsActivities] = await Promise.all([
                base44.entities.Contact.filter(filter),
                base44.entities.Account.filter(filter),
                base44.entities.Lead.filter(filter),
                base44.entities.Opportunity.filter(filter),
                base44.entities.Activity.filter(filter)
            ]);
            
            headers = ["Metric", "Count", "Export Date"];
            return {
                headers,
                rows: [
                    ["Total Contacts", trendsContacts.length, new Date().toISOString().split('T')[0]],
                    ["Total Accounts", trendsAccounts.length, new Date().toISOString().split('T')[0]],
                    ["Total Leads", trendsLeads.length, new Date().toISOString().split('T')[0]],
                    ["Total Opportunities", trendsOpportunities.length, new Date().toISOString().split('T')[0]],
                    ["Total Activities", trendsActivities.length, new Date().toISOString().split('T')[0]]
                ]
            };

        case 'forecasting':
            console.log('Exporting forecasting data - using opportunities');
            records = await base44.entities.Opportunity.filter({
                ...filter,
                stage: { $nin: ['closed_won', 'closed_lost'] }
            });
            headers = ["Opportunity Name", "Stage", "Amount", "Probability (%)", "Weighted Value", "Close Date", "Days to Close"];
            return {
                headers,
                rows: records.map(r => {
                    const amount = Number(r.amount) || 0;
                    const probability = Number(r.probability) || 0;
                    const weightedValue = (amount * probability) / 100;
                    const daysToClose = r.close_date ? Math.ceil((new Date(r.close_date) - new Date()) / (1000 * 60 * 60 * 24)) : '';
                    
                    return [
                        clean(r.name),
                        clean(r.stage),
                        clean(`$${amount.toLocaleString()}`),
                        clean(probability),
                        clean(`$${Math.round(weightedValue).toLocaleString()}`),
                        clean(r.close_date),
                        clean(daysToClose)
                    ];
                })
            };

        case 'ai_insights':
            console.log('Exporting AI insights - using summary format');
            const [insightsContacts, insightsAccounts, insightsLeads, insightsOpportunities] = await Promise.all([
                base44.entities.Contact.filter(filter),
                base44.entities.Account.filter(filter),
                base44.entities.Lead.filter(filter),
                base44.entities.Opportunity.filter(filter)
            ]);

            headers = ["Business Metric", "Value", "Analysis Date"];
            const totalPipeline = insightsOpportunities.reduce((sum, opp) => sum + (Number(opp.amount) || 0), 0);
            const avgDealSize = insightsOpportunities.length > 0 ? totalPipeline / insightsOpportunities.length : 0;
            const winRate = insightsOpportunities.length > 0 ? 
                (insightsOpportunities.filter(opp => opp.stage === 'closed_won').length / insightsOpportunities.length) * 100 : 0;

            return {
                headers,
                rows: [
                    ["Total Contacts", insightsContacts.length, new Date().toISOString().split('T')[0]],
                    ["Total Accounts", insightsAccounts.length, new Date().toISOString().split('T')[0]],
                    ["Total Leads", insightsLeads.length, new Date().toISOString().split('T')[0]],
                    ["Total Pipeline Value", `$${totalPipeline.toLocaleString()}`, new Date().toISOString().split('T')[0]],
                    ["Average Deal Size", `$${Math.round(avgDealSize).toLocaleString()}`, new Date().toISOString().split('T')[0]],
                    ["Win Rate (%)", `${winRate.toFixed(1)}%`, new Date().toISOString().split('T')[0]]
                ]
            };

        case 'overview':
        default:
            console.log('Exporting overview data');
            const [overviewContacts, overviewAccounts] = await Promise.all([
                base44.entities.Contact.filter(filter),
                base44.entities.Account.filter(filter)
            ]);
            headers = ["Contact Name", "Contact Email", "Contact Phone", "Account Name", "Account Industry", "Contact Status"];
            const contactAccountMap = overviewAccounts.reduce((map, acc) => {
                map[acc.id] = { name: acc.name, industry: acc.industry };
                return map;
            }, {});

            return {
                headers,
                rows: overviewContacts.map(c => [
                    clean(`${c.first_name || ''} ${c.last_name || ''}`.trim()),
                    clean(c.email),
                    clean(c.phone),
                    clean(contactAccountMap[c.account_id]?.name),
                    clean(contactAccountMap[c.account_id]?.industry),
                    clean(c.status)
                ])
            };
    }
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { reportType = 'overview', tenantFilter = {} } = await req.json();
        
        const { headers, rows } = await getReportData(base44, reportType, tenantFilter);

        // Convert to CSV string
        const csvHeader = headers.map(escapeCsvValue).join(',');
        const csvRows = rows.map(row => row.map(escapeCsvValue).join(',')).join('\n');
        const csvContent = `${csvHeader}\n${csvRows}`;
        
        const cleanReportType = reportType.replace(/[^a-zA-Z0-9]/g, '_');
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `${cleanReportType}_report_${dateStr}.csv`;
        
        return new Response(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv;charset=utf-8;',
                'Content-Disposition': `attachment; filename="${fileName}"`,
            }
        });

    } catch (error) {
        console.error('Error generating CSV report:', error);
        return new Response(JSON.stringify({ error: 'Failed to generate CSV report', details: error.message }), { 
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default exportReportToCSV;
