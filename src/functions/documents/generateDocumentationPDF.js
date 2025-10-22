/**
 * generateDocumentationPDF
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jsPDF } from 'npm:jspdf@2.5.1';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    // First, perform all authentication and authorization checks
    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const user = await base44.auth.me();
    // Allow both 'admin' and 'superadmin' roles to generate documents
    if (user.role !== 'superadmin' && user.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden: Administrator access required' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Only after auth is confirmed, consume the request body
    const requestData = await req.json();
    const docType = requestData.type || 'user_guide';

    try {
        const doc = new jsPDF();

        // Set up fonts and styling
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);

        let yPosition = 20;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        const lineHeight = 6;
        const maxWidth = doc.internal.pageSize.width - 2 * margin;

        // Helper function to add text with automatic page breaks
        const addText = (text, fontSize = 10, style = 'normal', indent = 0) => {
            if (yPosition > pageHeight - 40) {
                doc.addPage();
                yPosition = 20;
            }

            doc.setFontSize(fontSize);
            doc.setFont("helvetica", style);

            // Clean text to avoid encoding issues - remove non-printable characters
            const cleanText = text.replace(/[\x01-\x1F\x7F-\x9F]/g, "");
            const textLines = doc.splitTextToSize(cleanText, maxWidth - indent);

            for (let i = 0; i < textLines.length; i++) {
                if (yPosition > pageHeight - 40) {
                    doc.addPage();
                    yPosition = 20;
                }
                doc.text(textLines[i], margin + indent, yPosition);
                yPosition += lineHeight;
            }
            yPosition += 2;
        };

        const addHeading = (text, level = 1) => {
            yPosition += level === 1 ? 10 : 8;
            const fontSize = level === 1 ? 18 : level === 2 ? 14 : 12;
            const style = level <= 2 ? 'bold' : 'normal';
            addText(text, fontSize, style);
            yPosition += level === 1 ? 6 : 4;
        };

        const addBulletPoint = (text, indent = 10, fontSize = 10, style = 'normal') => {
            addText(`• ${text}`, fontSize, style, indent);
        };

        const addNumberedPoint = (text, number, indent = 10, fontSize = 10, style = 'normal') => {
            addText(`${number}. ${text}`, fontSize, style, indent);
        };

        // --- Section numbering map for user guide ---
        const userGuideSectionNumbers = {
            'Getting Started: The Dashboard': 1,
            'Contact Management: Building Relationships': 2,
            'Account Management: Company Intelligence': 3,
            'Lead Management & Conversion': 4,
            'AI CRM Agent & WhatsApp Integration': 5,
            'Opportunity Pipeline Management': 6,
            'Activity & Task Management': 7,
            'AI-Powered Features': 8,
            'Reports & Analytics': 9,
            'Data Import/Export': 10,
            'Advanced Features & Tips': 11
        };

        const getNumberedUserGuideHeading = (baseText, key, level = 2) => {
            const num = userGuideSectionNumbers[key];
            if (num !== undefined) {
                return `${num}. ${baseText.replace(/^\d+\.\s*/, '')}`;
            }
            return baseText;
        };

        if (docType === 'user_guide' || docType === 'all') {
            doc.addPage();
            yPosition = margin;

            addHeading('Ai-SHA CRM: Complete User Guide', 1);
            addText('Version 2.0 - December 2024');
            addText('Welcome to Ai-SHA CRM - Your comprehensive, AI-powered customer relationship management platform built for modern businesses.');

            addHeading('Table of Contents', 2);
            addText(getNumberedUserGuideHeading('Getting Started: The Dashboard', 'Getting Started: The Dashboard'));
            addText(getNumberedUserGuideHeading('Contact Management: Building Relationships', 'Contact Management: Building Relationships'));
            addText(getNumberedUserGuideHeading('Account Management: Company Intelligence', 'Account Management: Company Intelligence'));
            addText(getNumberedUserGuideHeading('Lead Management & Conversion', 'Lead Management & Conversion'));
            addText(getNumberedUserGuideHeading('AI CRM Agent & WhatsApp Integration', 'AI CRM Agent & WhatsApp Integration'));
            addText(getNumberedUserGuideHeading('Opportunity Pipeline Management', 'Opportunity Pipeline Management'));
            addText(getNumberedUserGuideHeading('Activity & Task Management', 'Activity & Task Management'));
            addText(getNumberedUserGuideHeading('AI-Powered Features', 'AI-Powered Features'));
            addText(getNumberedUserGuideHeading('Reports & Analytics', 'Reports & Analytics'));
            addText(getNumberedUserGuideHeading('Data Import/Export', 'Data Import/Export'));
            addText(getNumberedUserGuideHeading('Advanced Features & Tips', 'Advanced Features & Tips'));

            // NEW SECTION: AI CRM Agent & WhatsApp Integration
            doc.addPage();
            yPosition = margin;
            addHeading(getNumberedUserGuideHeading('AI CRM Agent & WhatsApp Integration', 'AI CRM Agent & WhatsApp Integration'), 2);

            const aiAgentText = [
                'The AI CRM Agent is your intelligent assistant that can help you manage your CRM data, research information,',
                'and perform tasks through natural conversation. You can interact with the agent both through the web interface',
                'and via WhatsApp for on-the-go access.',
                '',
                'Accessing the AI Agent:',
                '• Navigate to the AI Agent page from the main navigation menu',
                '• The agent icon shows as an avatar in the sidebar',
                '• You can ask questions, request reports, create records, and more',
                '',
                'What the AI Agent Can Do:',
                '• Search and retrieve CRM data (contacts, leads, accounts, opportunities)',
                '• Create new leads, contacts, and activities',
                '• Research companies and contacts on the web',
                '• Provide summaries of your pipeline and recent activities',
                '• Answer questions about your CRM data',
                '',
                'WHATSAPP INTEGRATION',
                '',
                'Connecting Your WhatsApp Account:',
                '1. Navigate to the AI Agent page in the CRM',
                '2. Click the WhatsApp button in the top-right corner of the agent chat interface',
                '3. If you are not already logged in, you will be redirected to log in first',
                '4. Follow the on-screen instructions to connect your WhatsApp account',
                '5. Once connected, you can chat with the AI agent directly from WhatsApp',
                '',
                'How WhatsApp Integration Works:',
                '• Your WhatsApp conversations are automatically tied to your current client/tenant data',
                '• The AI agent will only access data from your assigned client when responding via WhatsApp',
                '• All security and data isolation rules apply to WhatsApp conversations',
                '• Admins who manage multiple clients: the WhatsApp connection uses the client you had',
                '  selected when you clicked the WhatsApp button',
                '',
                'Using the Agent via WhatsApp:',
                '• Simply send a message to the connected WhatsApp number',
                '• Ask questions like: Show me my open opportunities or Create a lead for John Doe at Acme Corp',
                '• The agent will respond with the same capabilities as the web interface',
                '• You can create records, search data, and get reports entirely through WhatsApp',
                '',
                'WhatsApp Best Practices:',
                '• Keep your messages clear and specific',
                '• The agent remembers context within a conversation',
                '• You can ask follow-up questions without repeating details',
                '• To start fresh, begin a new conversation thread',
                '',
                'Data Security & Privacy:',
                '• All WhatsApp conversations are encrypted end-to-end by WhatsApp',
                '• Your tenant data is never mixed with other clients data',
                '• The AI agent can only access data you have permission to see',
                '• Conversation history is stored securely and tied to your user account',
                '',
                'Disconnecting WhatsApp:',
                '• Contact your system administrator if you need to disconnect your WhatsApp account',
                '• You can reconnect at any time by clicking the WhatsApp button again',
            ];

            aiAgentText.forEach((line) => {
                if (line === 'WHATSAPP INTEGRATION') {
                    addHeading(line, 3);
                } else if (line.startsWith('•')) {
                    addBulletPoint(line.substring(2), 10, 11);
                } else if (line.match(/^\d+\./)) {
                    const match = line.match(/^(\d+)\.\s*(.*)/);
                    if (match) {
                        addNumberedPoint(match[2], parseInt(match[1]), 10, 11);
                    } else {
                        addText(line, 11);
                    }
                } else if (line === '') {
                    yPosition += 4;
                } else if (line.endsWith(':')) {
                    addText(line, 11, 'bold');
                } else {
                    addText(line, 11);
                }
            });

            // Footer
            addText('');
            addText('---');
            addText('Built by 4V Data Consulting LLC');
            addText('Ai-SHA is a registered trademark of 4V Data Consulting LLC.');
            addText('© 2024 4V Data Consulting LLC. All rights reserved.');
            addText('');
            addText('For technical support and questions, please contact your system administrator.');
            addText('Documentation Version 2.0 - December 2024');
        }

        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${docType === 'user_guide' ? 'Ai-SHA_CRM_User_Guide.pdf' : 'Ai-SHA_CRM_Admin_Guide.pdf'}"`
            }
        });

    } catch (error) {
        console.error("Error generating PDF:", error);
        return new Response(JSON.stringify({
            status: 'error',
            message: 'PDF generation failed',
            error_details: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default generateDocumentationPDF;
