/* global Deno */
/**
 * generateUserGuidePDF
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const { content: guideContent } = await req.json();
        
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        let y = margin;
        
        const addHeader = (title) => {
            doc.setFontSize(22);
            doc.setFont(undefined, 'bold');
            doc.text(title, margin, y);
            y += 15;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`Generated on: ${new Date().toLocaleDateString()}`, margin, y);
            y += 10;
        };

        const addSectionTitle = (title) => {
            if (y > pageHeight - 40) { doc.addPage(); y = margin; }
            doc.setFontSize(16);
            doc.setFont(undefined, 'bold');
            doc.text(title, margin, y);
            y += 10;
        };
        
        const addBodyText = (text) => {
            doc.setFontSize(11);
            doc.setFont(undefined, 'normal');
            const splitText = doc.splitTextToSize(text, doc.internal.pageSize.width - margin * 2);
            for (const line of splitText) {
                if (y > pageHeight - 20) { doc.addPage(); y = margin; }
                doc.text(line, margin, y);
                y += 7;
            }
        };

    addHeader("ai-sha crm User Guide");
        
        const userGuideModules = ['introduction', 'dashboard', 'contacts', 'leads', 'accounts', 'opportunities', 'activities'];

        for(const moduleKey of userGuideModules) {
            const module = guideContent[moduleKey];
            if(module) {
                addSectionTitle(module.title);
                addBodyText(module.description);
                y += 5;
                for(const section of module.sections) {
                    addBodyText(`• ${section.title}`);
                }
                y += 10;
            }
        }

        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.text(`Page ${i} of ${totalPages}`, doc.internal.pageSize.width - margin, pageHeight - 10, { align: 'right' });
        }
        
        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="ai-sha-crm-user-guide.pdf"' }
        });
    } catch (error) {
        console.error('Error generating User Guide PDF:', error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});

 