/**
 * exportReportToPDF
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { reportType, tenantFilter, tenantName, aiInsightsData } = await req.json();

    const doc = new jsPDF();
    let yPosition = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);

    // Helper to format numbers with proper separators
    const formatNumber = (num) => {
      if (typeof num !== 'number') return num;
      return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
    };

    // Helper to format currency
    const formatCurrency = (num) => {
      if (typeof num !== 'number') return num;
      return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    };

    // Helper function to add a new page if needed
    const checkPageBreak = (neededSpace = 20) => {
      if (yPosition + neededSpace > pageHeight - 20) {
        doc.addPage();
        yPosition = 20;
        return true;
      }
      return false;
    };

    // Helper function to wrap text - FIXED to use global yPosition
    const addWrappedText = (text, x, maxWidth, fontSize = 10) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text || '', maxWidth);
      const lineHeight = fontSize * 0.5;
      
      lines.forEach(line => {
        checkPageBreak(lineHeight + 5);
        doc.text(line, x, yPosition);
        yPosition += lineHeight;
      });
    };

    // Helper to draw trend arrow using shapes (ASCII-safe)
    const drawTrendArrow = (x, y, trend) => {
      if (trend === 'up') {
        // Green up arrow using triangle
        doc.setDrawColor(34, 197, 94); // green-500
        doc.setFillColor(34, 197, 94);
        doc.triangle(x, y + 2, x + 2, y - 1, x + 4, y + 2, 'F');
        doc.text('UP', x + 6, y + 2);
      } else if (trend === 'down') {
        // Red down arrow using triangle
        doc.setDrawColor(239, 68, 68); // red-500
        doc.setFillColor(239, 68, 68);
        doc.triangle(x, y - 1, x + 2, y + 2, x + 4, y - 1, 'F');
        doc.text('DOWN', x + 6, y + 2);
      } else {
        // Gray horizontal line for stable
        doc.setDrawColor(156, 163, 175); // gray-400
        doc.line(x, y + 1, x + 4, y + 1);
        doc.text('STABLE', x + 6, y + 2);
      }
      doc.setDrawColor(0, 0, 0); // Reset to black
    };

    // Title
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(`Ai-SHA ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`, margin, yPosition);
    yPosition += 15;

    // Metadata
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    doc.text(`Generated: ${dateStr}`, margin, yPosition);
    yPosition += 6;
    doc.text(`Requested by: ${user.full_name || user.email}`, margin, yPosition);
    yPosition += 6;
    if (tenantName) {
      doc.text(`Organization: ${tenantName}`, margin, yPosition);
      yPosition += 6;
    }
    yPosition += 10;

    // Fetch data based on report type
    const effectiveFilter = { ...tenantFilter };
    if (!('is_test_data' in effectiveFilter)) {
      effectiveFilter.is_test_data = { $ne: true };
    }

    if (reportType === 'overview' || reportType === 'insights') {
      // Summary Section
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      checkPageBreak();
      doc.text('Summary', margin, yPosition);
      yPosition += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      const [contacts, leads, accounts, opportunities] = await Promise.all([
        base44.asServiceRole.entities.Contact.filter(effectiveFilter),
        base44.asServiceRole.entities.Lead.filter(effectiveFilter),
        base44.asServiceRole.entities.Account.filter(effectiveFilter),
        base44.asServiceRole.entities.Opportunity.filter(effectiveFilter)
      ]);

      const pipelineValue = opportunities.reduce((sum, opp) => sum + (opp.amount || 0), 0);
      const closedWon = opportunities.filter(o => o.stage === 'closed_won');
      const closedLost = opportunities.filter(o => o.stage === 'closed_lost');

      const summaryData = [
        ['Contacts:', formatNumber(contacts.length)],
        ['Leads:', formatNumber(leads.length)],
        ['Accounts:', formatNumber(accounts.length)],
        ['Opportunities:', formatNumber(opportunities.length)],
        ['Pipeline Value:', formatCurrency(pipelineValue)],
        ['Closed Won:', formatNumber(closedWon.length)],
        ['Closed Lost:', formatNumber(closedLost.length)]
      ];

      summaryData.forEach(([label, value]) => {
        checkPageBreak();
        doc.setFont('helvetica', 'bold');
        doc.text(label, margin, yPosition);
        doc.setFont('helvetica', 'normal');
        doc.text(value.toString(), margin + 80, yPosition);
        yPosition += 8;
      });

      yPosition += 10;

      // AI Market Insights Executive Summary
      if (reportType === 'insights' && aiInsightsData) {
        checkPageBreak(30);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('AI Market Insights - Executive Summary', margin, yPosition);
        yPosition += 12;

        // Market Overview
        if (aiInsightsData.market_overview) {
          checkPageBreak(20);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 64, 175);
          doc.text('Market Overview', margin, yPosition);
          yPosition += 8;
          
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(10);
          addWrappedText(aiInsightsData.market_overview, margin, contentWidth);
          yPosition += 10;
        }

        // SWOT Analysis
        if (aiInsightsData.swot_analysis) {
          checkPageBreak(30);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 64, 175);
          doc.text('SWOT Analysis', margin, yPosition);
          yPosition += 10;
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(10);

          // Strengths
          if (aiInsightsData.swot_analysis.strengths && aiInsightsData.swot_analysis.strengths.length > 0) {
            checkPageBreak(15);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(34, 197, 94);
            doc.text('Strengths:', margin, yPosition);
            yPosition += 6;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
            
            aiInsightsData.swot_analysis.strengths.forEach(item => {
              checkPageBreak(10);
              doc.text('+ ' + item, margin + 5, yPosition);
              yPosition += 6;
            });
            yPosition += 4;
          }

          // Weaknesses
          if (aiInsightsData.swot_analysis.weaknesses && aiInsightsData.swot_analysis.weaknesses.length > 0) {
            checkPageBreak(15);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(239, 68, 68);
            doc.text('Weaknesses:', margin, yPosition);
            yPosition += 6;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
            
            aiInsightsData.swot_analysis.weaknesses.forEach(item => {
              checkPageBreak(10);
              doc.text('- ' + item, margin + 5, yPosition);
              yPosition += 6;
            });
            yPosition += 4;
          }

          // Opportunities
          if (aiInsightsData.swot_analysis.opportunities && aiInsightsData.swot_analysis.opportunities.length > 0) {
            checkPageBreak(15);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(59, 130, 246);
            doc.text('Opportunities:', margin, yPosition);
            yPosition += 6;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
            
            aiInsightsData.swot_analysis.opportunities.forEach(item => {
              checkPageBreak(10);
              doc.text('> ' + item, margin + 5, yPosition);
              yPosition += 6;
            });
            yPosition += 4;
          }

          // Threats
          if (aiInsightsData.swot_analysis.threats && aiInsightsData.swot_analysis.threats.length > 0) {
            checkPageBreak(15);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(249, 115, 22);
            doc.text('Threats:', margin, yPosition);
            yPosition += 6;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0, 0, 0);
            
            aiInsightsData.swot_analysis.threats.forEach(item => {
              checkPageBreak(10);
              doc.text('! ' + item, margin + 5, yPosition);
              yPosition += 6;
            });
            yPosition += 4;
          }
        }

        // Competitive Landscape
        if (aiInsightsData.competitive_landscape) {
          checkPageBreak(20);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 64, 175);
          doc.text('Competitive Landscape', margin, yPosition);
          yPosition += 8;
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(10);

          if (aiInsightsData.competitive_landscape.overview) {
            doc.setFont('helvetica', 'normal');
            addWrappedText(aiInsightsData.competitive_landscape.overview, margin, contentWidth);
            yPosition += 6;
          }

          if (aiInsightsData.competitive_landscape.major_competitors && aiInsightsData.competitive_landscape.major_competitors.length > 0) {
            checkPageBreak(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Major Competitors:', margin, yPosition);
            yPosition += 6;
            doc.setFont('helvetica', 'normal');
            
            aiInsightsData.competitive_landscape.major_competitors.forEach(comp => {
              checkPageBreak(6);
              doc.text('* ' + comp, margin + 5, yPosition);
              yPosition += 6;
            });
          }
          yPosition += 6;
        }

        // Major News & Events
        if (aiInsightsData.major_news && aiInsightsData.major_news.length > 0) {
          checkPageBreak(20);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 64, 175);
          doc.text('Major News & Events', margin, yPosition);
          yPosition += 10;
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(10);

          aiInsightsData.major_news.forEach((news, idx) => {
            checkPageBreak(20);
            
            // Title and impact badge
            doc.setFont('helvetica', 'bold');
            doc.text(`${idx + 1}. ${news.title}`, margin, yPosition);
            
            // Impact indicator
            if (news.impact) {
              const impactX = margin + doc.getTextWidth(`${idx + 1}. ${news.title}`) + 5;
              if (news.impact === 'positive') {
                doc.setTextColor(34, 197, 94);
                doc.text('[+]', impactX, yPosition);
              } else if (news.impact === 'negative') {
                doc.setTextColor(239, 68, 68);
                doc.text('[-]', impactX, yPosition);
              } else {
                doc.setTextColor(156, 163, 175);
                doc.text('[=]', impactX, yPosition);
              }
              doc.setTextColor(0, 0, 0);
            }
            
            yPosition += 6;
            
            if (news.date) {
              doc.setFont('helvetica', 'italic');
              doc.setFontSize(9);
              doc.text(news.date, margin + 5, yPosition);
              yPosition += 5;
              doc.setFontSize(10);
            }
            
            doc.setFont('helvetica', 'normal');
            addWrappedText(news.description, margin + 5, contentWidth - 10);
            yPosition += 8;
          });
        }

        // Strategic Recommendations
        if (aiInsightsData.recommendations && aiInsightsData.recommendations.length > 0) {
          checkPageBreak(20);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 64, 175);
          doc.text('Strategic Recommendations', margin, yPosition);
          yPosition += 10;
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(10);

          aiInsightsData.recommendations.forEach((rec, idx) => {
            checkPageBreak(15);
            
            // Title with priority
            doc.setFont('helvetica', 'bold');
            doc.text(`${idx + 1}. ${rec.title}`, margin, yPosition);
            
            // Priority badge
            if (rec.priority) {
              const priorityX = margin + doc.getTextWidth(`${idx + 1}. ${rec.title}`) + 5;
              if (rec.priority === 'high') {
                doc.setTextColor(239, 68, 68);
                doc.text('[HIGH]', priorityX, yPosition);
              } else if (rec.priority === 'medium') {
                doc.setTextColor(249, 115, 22);
                doc.text('[MEDIUM]', priorityX, yPosition);
              } else {
                doc.setTextColor(59, 130, 246);
                doc.text('[LOW]', priorityX, yPosition);
              }
              doc.setTextColor(0, 0, 0);
            }
            
            yPosition += 6;
            doc.setFont('helvetica', 'normal');
            addWrappedText(rec.description, margin + 5, contentWidth - 10);
            yPosition += 8;
          });
        }

        // Economic Indicators
        if (aiInsightsData.economic_indicators && aiInsightsData.economic_indicators.length > 0) {
          checkPageBreak(30);
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(20, 184, 166);
          doc.text('Key Economic Indicators', margin, yPosition);
          yPosition += 12;
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(10);

          aiInsightsData.economic_indicators.forEach((indicator) => {
            checkPageBreak(12);
            
            doc.setFont('helvetica', 'bold');
            doc.text(indicator.name + ':', margin, yPosition);
            
            // Format the value properly based on unit
            let formattedValue = '';
            if (indicator.unit && indicator.unit.toLowerCase().includes('usd')) {
              formattedValue = formatCurrency(indicator.current_value);
            } else if (indicator.unit && indicator.unit.toLowerCase().includes('percent')) {
              formattedValue = formatNumber(indicator.current_value) + ' percent';
            } else if (indicator.unit && indicator.unit.toLowerCase().includes('unit')) {
              formattedValue = formatNumber(indicator.current_value) + ' ' + indicator.unit;
            } else {
              formattedValue = formatNumber(indicator.current_value) + (indicator.unit ? ' ' + indicator.unit : '');
            }
            
            doc.setFont('helvetica', 'normal');
            const valueX = margin + 100;
            doc.text(formattedValue, valueX, yPosition);
            
            // Draw trend arrow
            if (indicator.trend) {
              const trendX = valueX + doc.getTextWidth(formattedValue) + 10;
              drawTrendArrow(trendX, yPosition - 3, indicator.trend);
            }
            
            yPosition += 8;
          });
        }
      }
    }

    // Generate PDF
    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${reportType}_report_${Date.now()}.pdf"`
      }
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

----------------------------

export default exportReportToPDF;
