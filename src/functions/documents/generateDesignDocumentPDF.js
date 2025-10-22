/**
 * generateDesignDocumentPDF
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';
import { jsPDF } from 'npm:jspdf@2.5.1';

const designDocument = {
  title: "AI-SHA CRM System Design Document",
  sections: [
    {
      title: "Executive Summary",
      content: [
        "This document outlines the comprehensive business requirements, user stories, and technical specifications for the AI-SHA CRM (Customer Relationship Management) system - a multi-tenant, role-based CRM platform with AI-powered features and extensive integration capabilities."
      ]
    },
    {
      title: "Business Requirements",
      content: [
        "BR-001: Multi-Tenant Architecture",
        "The system must support multiple independent tenants (organizations) with complete data isolation and customizable branding.",
        "",
        "BR-002: Role-Based Access Control", 
        "The system must implement a hierarchical permission system with four distinct roles:",
        "• Super Admin: System creator with full platform access",
        "• Admin: Tenant owner with full tenant management capabilities", 
        "• Power User: Advanced user with cross-tenant data visibility and export capabilities",
        "• User: Standard user with basic CRM functionality",
        "",
        "BR-003: Core CRM Functionality",
        "The system must provide comprehensive customer relationship management capabilities:",
        "• Contact Management with full CRUD operations",
        "• Account (Company) Management with industry categorization",
        "• Lead Management with conversion tracking",
        "• Opportunity Management with sales pipeline visualization",
        "• Activity Tracking with scheduling and follow-up capabilities",
        "• Document Management with secure storage, preview, and deletion", // Added
        "",
        "BR-004: AI-Powered Features",
        "The system must leverage artificial intelligence to enhance productivity:",
        "• Document processing (business cards, receipts, invoices)",
        "• AI-powered calling campaigns with multiple provider support",
        "• Intelligent data extraction and categorization",
        "• Voice-powered CRM queries via ElevenLabs integration",
        "• Automated email generation and responses",
        "",
        "BR-005: Financial Management",
        "The system must include cash flow tracking and financial management:",
        "• Income and expense tracking",
        "• Receipt processing with AI extraction", 
        "• Recurring transaction management",
        "• Financial reporting and analytics",
        "• Integration with accounting workflows",
        "",
        "BR-006: Integration Ecosystem",
        "The system must support extensive third-party integrations:",
        "• Webhook-based data synchronization",
        "• API key management for external access",
        "• Email service integrations",
        "• Cloud storage integrations (Google Drive, OneDrive)",
        "• Calendar integrations (Google Calendar, Outlook)",
        "• Payment processing (Stripe)"
      ]
    },
    {
      title: "User Stories - Key Examples",
      content: [
        "US-001: User Invitation System",
        "As an Admin, I want to invite users to join my tenant with specific roles, so that I can build my team with appropriate access levels.",
        "",
        "US-003: Lead Conversion Process", 
        "As a Sales Representative, I want to convert qualified leads into contacts and accounts, so that I can progress prospects through my sales pipeline.",
        "",
        "US-004: AI-Powered Document Processing",
        "As a Sales User, I want to scan business cards and automatically create contact records, so that I can quickly capture prospect information at events.",
        "",
        "US-006: Automated Receipt Processing",
        "As a Business Owner, I want to photograph receipts and have expenses automatically categorized, so that I can maintain accurate financial records without manual data entry.",
        "",
        "US-007: AI Calling Campaigns",
        "As a Sales Manager, I want to create automated calling campaigns that use AI to contact prospects, so that I can scale outreach without increasing manual effort.",
        "",
        "US-008: Comprehensive System Monitoring",
        "As a System Administrator, I want to monitor system health, performance, and security, so that I can ensure reliable service for all tenants.",
        "",
        "US-009: Secure Document Management", // Added
        "As an Admin, I want to manage all uploaded documents in a centralized location, with the ability to preview, search, and securely delete files, so that I can maintain a clean and organized document repository."
      ]
    },
    {
      title: "Technical Architecture",
      content: [
        "Frontend Data Contracts:",
        "• Entity Schema Definition using JSON Schema format",
        "• TypeScript-style JSDoc comments for type safety",
        "• Explicit relationship mapping with foreign keys",
        "• Validation rules with required fields and constraints",
        "",
        "Security, Authentication & Authorization:",
        "• Multi-layered Authentication (Bearer tokens, API keys, sessions)",
        "• Row-Level Security (RLS) for database-enforced data isolation",
        "• Role-Based Access Control with hierarchical permissions",
        "• API Security with rate limiting, CORS protection, audit logging",
        "",
        "Scalability & Performance:",
        "• Smart Caching with frontend API result caching",
        "• Pagination for large datasets",
        "• Lazy Loading for improved initial load times", 
        "• Database Optimization with indexed queries",
        "",
        "Maintainability:",
        "• Schema-Driven Development as single source of truth",
        "• Automated Testing with comprehensive QA test runner",
        "• Version Control with entity schema versioning",
        "• Auto-generated API documentation from schemas",
        "",
        "Technology Stack:",
        "• Frontend: React with shadcn/ui component library",
        "• Backend: Deno serverless functions with Base44 SDK", 
        "• Database: PostgreSQL with Row-Level Security",
        "• Authentication: Google OAuth with custom role management",
        "• Storage: Cloudflare R2 for file storage",
        "• AI/ML: Integration with OpenAI, ElevenLabs, and custom AI providers"
      ]
    },
    {
      title: "Implementation Status",
      content: [
        "Phase 1: Core CRM (✅ Completed)",
        "• Multi-tenant architecture with data isolation",
        "• Role-based access control system", 
        "• Contact, Account, Lead, and Opportunity management",
        "• Activity tracking and scheduling",
        "",
        "Phase 2: Advanced Features (✅ Completed)",
        "• AI-powered document processing",
        "• Document Management Page with R2 integration", // Added
        "• Cash flow management with receipt processing",
        "• Webhook integration system",
        "• User management and invitation system",
        "",
        "Phase 3: Enterprise Features (✅ Completed)",
        "• AI calling campaigns with multi-provider support",
        "• Advanced reporting and analytics",
        "• System monitoring and health checks",
        "• API security with key management",
        "",
        "Phase 4: Optimization & Scaling (🔄 In Progress)",
        "• Performance monitoring and optimization",
        "• Enhanced caching strategies",
        "• Advanced security hardening", 
        "• Automated testing expansion"
      ]
    }
  ]
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify user is authenticated and has admin permissions
    const user = await base44.auth.me();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 });
    }

    // Create PDF document
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    const lineHeight = 7;
    let yPosition = margin;

    // Title
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text(designDocument.title, margin, yPosition);
    yPosition += lineHeight * 2;

    // Add creation date and author
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPosition);
    yPosition += lineHeight;
    doc.text(`Created by: ${user.full_name || user.email}`, margin, yPosition);
    yPosition += lineHeight * 2;

    // Process sections
    for (const section of designDocument.sections) {
      // Check if we need a new page
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
      }

      // Section title
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text(section.title, margin, yPosition);
      yPosition += lineHeight * 1.5;

      // Section content
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');

      for (const line of section.content) {
        // Check for page break
        if (yPosition > pageHeight - 20) {
          doc.addPage();
          yPosition = margin;
        }

        if (line === '') {
          yPosition += lineHeight * 0.5;
          continue;
        }

        // Handle long lines by splitting them
        const splitText = doc.splitTextToSize(line, pageWidth - (margin * 2));
        
        for (const textLine of splitText) {
          if (yPosition > pageHeight - 20) {
            doc.addPage();
            yPosition = margin;
          }
          
          // Check if this is a bullet point or title
          if (textLine.startsWith('•') || textLine.startsWith('BR-') || textLine.startsWith('US-')) {
            doc.setFont(undefined, 'bold');
          } else if (textLine.includes(':')) {
            doc.setFont(undefined, 'bold');
          } else {
            doc.setFont(undefined, 'normal');
          }
          
          doc.text(textLine, margin, yPosition);
          yPosition += lineHeight;
        }
      }

      yPosition += lineHeight; // Space between sections
    }

    // Add footer to all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text(`AI-SHA CRM Design Document - Page ${i} of ${totalPages}`, margin, pageHeight - 10);
      doc.text('© 2025 4V Data Consulting LLC. All rights reserved.', pageWidth - margin - 80, pageHeight - 10);
    }

    // Generate PDF
    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="AI-SHA_CRM_Design_Document.pdf"'
      }
    });

  } catch (error) {
    console.error('Error generating design document PDF:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});


----------------------------

export default generateDesignDocumentPDF;
