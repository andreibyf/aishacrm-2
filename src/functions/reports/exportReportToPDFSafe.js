/**
 * exportReportToPDFSafe
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
  const started = Date.now();
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const reportType = body?.reportType || 'overview';
    const tenantFilter = body?.tenantFilter || {};
    const tenantName = (body?.tenantName || 'Ai-SHA CRM').toString();

    // Guard: require tenant filter for superadmin to avoid cross-tenant reads
    if ((user.role === 'superadmin') && !tenantFilter?.tenant_id) {
      return new Response(JSON.stringify({
        error: 'Tenant not selected',
        details: 'Please select a tenant before exporting reports.'
      }), { status: 400 });
    }

    // Fetch lightweight, tenant-scoped data for the PDF
    const filter = { ...(tenantFilter || {}) };
    const [
      contacts, leads, opportunities, activities, accounts
    ] = await Promise.all([
      base44.entities.Contact.filter(filter).catch(() => []),
      base44.entities.Lead.filter(filter).catch(() => []),
      base44.entities.Opportunity.filter(filter).catch(() => []),
      base44.entities.Activity.filter(filter).catch(() => []),
      base44.entities.Account.filter(filter).catch(() => []),
    ]);

    const pipelineValue = (opportunities || []).reduce((s, o) => s + (o.amount || 0), 0);
    const wonDeals = (opportunities || []).filter(o => o.stage === 'closed_won');
    const lostDeals = (opportunities || []).filter(o => o.stage === 'closed_lost');

    // Build PDF without any unsupported jsPDF extensions
    const doc = new jsPDF('p', 'mm', 'a4');
    const margin = 16;
    let y = margin;

    const addTitle = (text, size = 18) => {
      doc.setFontSize(size);
      doc.setFont(undefined, 'bold');
      doc.text(text, margin, y);
      y += 8;
      doc.setFont(undefined, 'normal');
    };

    const addLine = () => {
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, 210 - margin, y);
      y += 6;
    };

    const addField = (label, value) => {
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text(`${label}:`, margin, y);
      doc.setFont(undefined, 'normal');
      const text = String(value ?? '');
      const maxWidth = 210 - margin * 2 - 35;
      const wrapped = doc.splitTextToSize(text, maxWidth);
      doc.text(wrapped, margin + 35, y);
      y += (wrapped.length * 6) + 2;
    };

    const addSection = (title) => {
      if (y > 270) { doc.addPage(); y = margin; }
      addLine();
      addTitle(title, 14);
    };

    // Header
    addTitle(`${tenantName} — ${reportType === 'ai_insights' ? 'AI Insights' : 'Report'} PDF`);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y); y += 6;
    doc.text(`Requested by: ${user.full_name || user.email}`, margin, y); y += 10;

    // Summary section
    addSection('Summary');
    addField('Contacts', contacts.length);
    addField('Leads', leads.length);
    addField('Accounts', accounts.length);
    addField('Opportunities', (opportunities || []).length);
    addField('Pipeline Value', `$${pipelineValue.toLocaleString()}`);
    addField('Closed Won', wonDeals.length);
    addField('Closed Lost', lostDeals.length);

    // Opportunities by stage
    const stageCounts = (opportunities || []).reduce((acc, o) => {
      const k = o.stage || 'unknown';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    addSection('Opportunities by Stage');
    Object.keys(stageCounts).sort().forEach((stage) => {
      addField(stage.replace(/_/g, ' ').toUpperCase(), stageCounts[stage]);
    });

    // Activities snapshot
    const activityCounts = (activities || []).reduce((acc, a) => {
      const k = a.status || 'unknown';
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    addSection('Activities Snapshot');
    Object.keys(activityCounts).sort().forEach((st) => {
      addField(st.toUpperCase(), activityCounts[st]);
    });

    // Footer page numbers
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.text(`Page ${i} of ${total}`, 210 - margin, 297 - 10, { align: 'right' });
    }

    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${reportType}_safe_report.pdf"`,
        'X-Generated-In': `${Date.now() - started}ms`
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Failed to generate Safe PDF report',
      details: err?.message || String(err)
    }), { status: 500 });
  }
});

----------------------------

export default exportReportToPDFSafe;
