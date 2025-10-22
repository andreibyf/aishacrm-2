/**
 * createTenantWithR2Bucket
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

// Check if R2 credentials are available
const hasR2Credentials = () => {
  return Deno.env.get('CLOUDFLARE_ACCOUNT_ID') && 
         Deno.env.get('R2_ACCESS_KEY_ID') && 
         Deno.env.get('R2_SECRET_ACCESS_KEY');
};

// Initialize R2 client only if credentials are available
let r2Client = null;
if (hasR2Credentials()) {
  try {
    const { S3Client, CreateBucketCommand, PutObjectCommand } = await import('npm:@aws-sdk/client-s3');
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${Deno.env.get('CLOUDFLARE_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID'),
        secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY'),
      },
    });
  } catch (error) {
    console.warn('Failed to initialize R2 client:', error);
    r2Client = null;
  }
}

async function createDefaultDocumentation(base44, tenantId, bucketName) {
    const userGuideContent = `# Welcome to Ai-SHA CRM: A Quick Start Guide

This guide will walk you through the essential workflows in Ai-SHA CRM to get you started quickly.

---

## 1. The Dashboard: Your Command Center

When you log in, you'll land on the **Dashboard**. This is your at-a-glance view of the most important metrics:
- **Key Stats**: Total contacts, accounts, and open deals.
- **Sales Pipeline**: See opportunities at each stage of your sales process.
- **Recent Activities**: Stay on top of your latest tasks and meetings.

---

## 2. Managing Leads: From Prospect to Opportunity

The goal is to turn new leads into paying customers.

**Workflow:**
1.  **Add a Lead**: Go to the **Leads** page and click "Add Lead". Fill in the details. The more information, the better!
2.  **Qualify the Lead**: Contact the lead (call, email). Use the **Activities** section on the lead's detail page to log your interactions.
3.  **Convert the Lead**: Once you've qualified the lead and they show interest, click the "Convert" button on their page. This will automatically create:
    *   A **Contact** record.
    *   An **Account** record (for the company).
    *   An **Opportunity** record to track the potential deal.

---

## 3. Working with Opportunities: Closing the Deal

The **Opportunities** page is where you manage your sales pipeline.

**Workflow:**
1.  **Track Stages**: Drag and drop opportunities across the Kanban board (e.g., from 'Qualification' to 'Proposal Sent').
2.  **Log Activities**: Schedule meetings, set reminders, and add notes to each opportunity to keep track of your progress.
3.  **Close the Deal**: When the deal is finalized, move the opportunity to "Closed Won" or "Closed Lost". This updates your sales reports automatically.

---

## 4. Staying Organized with Activities

The **Activities** page is your to-do list. It aggregates all tasks, meetings, and calls from across the CRM.
- **Create Activities**: You can create standalone activities or link them to specific Contacts, Accounts, or Opportunities.
- **Due Dates**: Keep an eye on due dates to ensure you never miss a follow-up.

---

This is just the beginning. Explore the system, and don't hesitate to use the **AI Assistant** in the bottom right for help!`;

    const chatbotGuideContent = `# Using the AI Assistant: Tips & Prompts

Your AI Assistant is a powerful tool designed to help you find information and gain insights from your CRM data quickly. Here's how to make the most of it.

---

## Best Practices

1.  **Be Specific**: Instead of "show me leads", try "show me new leads from the 'website' source in the last week".
2.  **Ask One Thing at a Time**: The assistant works best with single, focused questions.
3.  **Use Natural Language**: You can ask questions as if you were talking to a person.
4.  **Reference Documents**: Ask questions about your uploaded documentation, like "What is our policy on returns?" or "Summarize the 'Q3 Sales Strategy' document."

---

## What Can the AI Assistant Do?

The assistant can access your CRM data (Contacts, Accounts, Leads, Opportunities) and any documents you've uploaded.

### Sample Prompts to Get You Started:

**For Leads & Contacts:**
- "Show me all new leads from the last 7 days."
- "Who are my top 5 contacts with the highest score?"
- "Find the contact information for John Smith at Example Corp."
- "Are there any leads assigned to me that I haven't contacted yet?"

**For Opportunities & Sales:**
- "What's the total value of opportunities in the 'Proposal' stage?"
- "List all opportunities expected to close this month."
- "Give me a summary of my sales pipeline."
- "Which opportunities have had no activity in the last 2 weeks?"

**For Activities & Tasks:**
- "What are my overdue tasks?"
- "Show me all calls I need to make today."
- "Create a follow-up task for the 'New Website Deal' opportunity, due tomorrow."

**For Document-Based Questions:**
- "Summarize the 'Onboarding Checklist' document for me."
- "What are the steps for processing a new order, according to our user guide?"
- "Find the section about API authentication in the documentation."

---

Experiment with different questions to see what insights you can uncover!`;

    const docsToCreate = [
        {
            title: "Welcome to Ai-SHA CRM: A Quick Start Guide",
            fileName: "user_guide.md",
            content: userGuideContent,
            category: "user_guide",
            tags: ["getting started", "workflow", "guide"]
        },
        {
            title: "Using the AI Assistant: Tips & Prompts",
            fileName: "ai_assistant_guide.md",
            content: chatbotGuideContent,
            category: "tutorial",
            tags: ["ai", "chatbot", "prompts", "assistant"]
        }
    ];

    for (const doc of docsToCreate) {
        try {
            console.log(`Creating documentation file: ${doc.title}`);
            const docRecord = await base44.asServiceRole.entities.DocumentationFile.create({
                title: doc.title,
                description: "A helpful guide to get you started with your new CRM.",
                file_name: doc.fileName,
                file_type: "text/markdown",
                extracted_content: doc.content,
                category: doc.category,
                tags: doc.tags,
                tenant_id: tenantId,
            });
            console.log(`Created DB record for ${doc.title} with ID: ${docRecord.id}`);

            // Only upload to R2 if available and bucket name is provided
            if (r2Client && bucketName) {
                try {
                    const { PutObjectCommand } = await import('npm:@aws-sdk/client-s3');
                    await r2Client.send(new PutObjectCommand({
                        Bucket: bucketName,
                        Key: `documents/${docRecord.id}/${doc.fileName}`,
                        Body: doc.content,
                        ContentType: 'text/markdown',
                    }));
                    console.log(`Successfully uploaded ${doc.fileName} to R2.`);
                } catch (r2Error) {
                    console.warn(`Failed to upload ${doc.fileName} to R2:`, r2Error);
                    // Continue anyway - the document is in the database
                }
            }
        } catch (error) {
            console.error(`Failed to create default document "${doc.title}":`, error);
        }
    }
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    // Ensure the user is authenticated and authorized
    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    const user = await base44.auth.me();
    if (user.role !== 'admin' && user.role !== 'superadmin') {
        return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), { 
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // Get tenant details from the request body
        const body = await req.json();
        const { name, domain, industry, business_model, geographic_focus, logo_url, primary_color, accent_color } = body;

        if (!name || !industry) {
            return new Response(JSON.stringify({ error: 'Tenant name and industry are required' }), { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Step 1: Create the Tenant record in the database
        console.log(`Creating tenant record for: ${name}`);
        const newTenant = await base44.asServiceRole.entities.Tenant.create({
            name,
            domain,
            industry,
            business_model: business_model || 'b2b',
            geographic_focus: geographic_focus || 'north_america',
            logo_url,
            primary_color: primary_color || '#3b82f6',
            accent_color: accent_color || '#f59e0b',
        });

        const tenantId = newTenant.id;
        console.log(`Successfully created tenant record with ID: ${tenantId}`);

        // Step 2: Try to create R2 bucket if credentials are available
        let bucketName = null;
        if (r2Client && hasR2Credentials()) {
            try {
                bucketName = `tenant-${tenantId}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
                const { CreateBucketCommand } = await import('npm:@aws-sdk/client-s3');
                await r2Client.send(new CreateBucketCommand({ Bucket: bucketName }));
                console.log(`Successfully created R2 bucket: ${bucketName}`);
            } catch (bucketError) {
                if (bucketError.name === 'BucketAlreadyExists' || bucketError.name === 'BucketAlreadyOwnedByYou') {
                    console.log(`R2 bucket already exists: ${bucketName}`);
                } else {
                    console.warn(`Failed to create R2 bucket: ${bucketError.message}`);
                    bucketName = null; // Continue without R2
                }
            }
        } else {
            console.log('R2 credentials not available, skipping bucket creation');
        }
        
        // Step 3: Create default documentation (works with or without R2)
        try {
            await createDefaultDocumentation(base44, tenantId, bucketName);
            console.log('Successfully created default documentation');
        } catch (docError) {
            console.warn('Failed to create default documentation:', docError);
            // Continue anyway - tenant creation shouldn't fail because of docs
        }

        // Step 4: Return successful result
        return new Response(JSON.stringify({
            status: 'success',
            message: `Tenant "${name}" created successfully.` + (bucketName ? ` R2 bucket "${bucketName}" also created.` : ' (R2 bucket creation skipped)'),
            tenant: newTenant,
            r2_bucket: bucketName,
        }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        console.error('Tenant provisioning failed:', error);
        return new Response(JSON.stringify({
            status: 'error',
            message: `Tenant provisioning failed: ${error.message}`,
            details: error.stack
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
});


----------------------------

export default createTenantWithR2Bucket;
