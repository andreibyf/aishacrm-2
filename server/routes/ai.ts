import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import Groq from "groq-sdk";
import { db } from "@db";
import {
  conversations,
  messages,
  users,
  contacts,
  companies,
  deals,
  activities,
  emailIntegrations,
} from "@db/schema";
import { eq, and, desc, asc, or, sql, isNull } from "drizzle-orm";
import { authenticateToken } from "../middleware/auth";
import type { Request, Response } from "express";
import nodemailer from "nodemailer";
import { differenceInMinutes } from "date-fns";
import Stripe from "stripe";

const router = Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

// Email configuration
const emailConfig = {
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || "587"),
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
};

interface EntityContext {
  contactId?: number;
  companyId?: number;
  dealId?: number;
  contactName?: string;
  companyName?: string;
  dealTitle?: string;
}

interface ClassifiedIntent {
  primary: string;
  confidence: number;
  entities?: {
    contactName?: string;
    companyName?: string;
    dealTitle?: string;
    emailAddress?: string;
    phoneNumber?: string;
    amount?: number;
    date?: string;
  };
  suggestedAction?: string;
}

async function getUserContext(userId: number): Promise<string> {
  const userContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .limit(50);

  const userCompanies = await db
    .select()
    .from(companies)
    .where(eq(companies.userId, userId))
    .limit(50);

  const userDeals = await db
    .select()
    .from(deals)
    .where(eq(deals.userId, userId))
    .limit(50);

  return `
User's CRM Data Context:
- Contacts (${userContacts.length}): ${userContacts
    .map((c) => `${c.name} (${c.email || "no email"})`)
    .join(", ")}
- Companies (${userCompanies.length}): ${userCompanies
    .map((c) => c.name)
    .join(", ")}
- Deals (${userDeals.length}): ${userDeals
    .map((d) => `${d.title} ($${d.value})`)
    .join(", ")}
`;
}

async function classifyIntent(
  message: string,
  conversationHistory: any[] = []
): Promise<ClassifiedIntent> {
  const systemPrompt = `You are an intent classification system for a CRM assistant. Analyze the user's message and recent conversation history to determine their primary intent.

Primary intent categories:
- create_contact: User wants to add a new contact
- create_company: User wants to add a new company
- create_deal: User wants to create a new deal
- update_contact: User wants to modify contact information
- update_company: User wants to modify company information
- update_deal: User wants to update deal details
- search_contact: User wants to find or view contact information
- search_company: User wants to find or view company information
- search_deal: User wants to find or view deal information
- send_email: User wants to send an email
- schedule_activity: User wants to schedule a meeting or task
- general_query: General questions or conversation
- greeting: Greetings or conversation starters

Extract any mentioned entities:
- contactName: Person's name
- companyName: Company/organization name
- dealTitle: Deal or opportunity title
- emailAddress: Email addresses
- phoneNumber: Phone numbers
- amount: Monetary values
- date: Date/time references

Consider the conversation context to understand references like "them", "it", "that deal", etc.

Respond in JSON format:
{
  "primary": "intent_category",
  "confidence": 0.0-1.0,
  "entities": {
    "contactName": "extracted name",
    "companyName": "extracted company",
    ...
  },
  "suggestedAction": "brief description of what the user likely wants to do"
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory
          .slice(-4)
          .map((msg: any) => ({
            role: msg.role,
            content: msg.content,
          })),
        { role: "user", content: message },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    return {
      primary: result.primary || "general_query",
      confidence: result.confidence || 0.5,
      entities: result.entities || {},
      suggestedAction: result.suggestedAction,
    };
  } catch (error) {
    console.error("Intent classification error:", error);
    return {
      primary: "general_query",
      confidence: 0.5,
      entities: {},
    };
  }
}

async function extractEntityContext(
  message: string,
  userId: number,
  conversationHistory: any[] = []
): Promise<EntityContext> {
  const systemPrompt = `You are a context extraction system for a CRM assistant. Analyze the user's message and conversation history to identify which CRM entities (contacts, companies, deals) they are referring to.

Consider:
1. Direct mentions of names, companies, or deals
2. Pronouns and references (e.g., "him", "that company", "this deal")
3. Context from previous messages in the conversation

Respond in JSON format with any identified entities:
{
  "contactName": "exact name if mentioned or referenced",
  "companyName": "exact company name if mentioned or referenced",
  "dealTitle": "exact deal title if mentioned or referenced"
}

Only include fields where you have high confidence. If unsure, omit the field.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory
          .slice(-6)
          .map((msg: any) => ({
            role: msg.role,
            content: msg.content,
          })),
        { role: "user", content: message },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const extracted = JSON.parse(
      completion.choices[0].message.content || "{}"
    );
    const context: EntityContext = {};

    // Look up contact by name
    if (extracted.contactName) {
      const contact = await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.userId, userId),
            sql`LOWER(${contacts.name}) LIKE LOWER(${`%${extracted.contactName}%`})`
          )
        )
        .limit(1);

      if (contact.length > 0) {
        context.contactId = contact[0].id;
        context.contactName = contact[0].name;
      }
    }

    // Look up company by name
    if (extracted.companyName) {
      const company = await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.userId, userId),
            sql`LOWER(${companies.name}) LIKE LOWER(${`%${extracted.companyName}%`})`
          )
        )
        .limit(1);

      if (company.length > 0) {
        context.companyId = company[0].id;
        context.companyName = company[0].name;
      }
    }

    // Look up deal by title
    if (extracted.dealTitle) {
      const deal = await db
        .select()
        .from(deals)
        .where(
          and(
            eq(deals.userId, userId),
            sql`LOWER(${deals.title}) LIKE LOWER(${`%${extracted.dealTitle}%`})`
          )
        )
        .limit(1);

      if (deal.length > 0) {
        context.dealId = deal[0].id;
        context.dealTitle = deal[0].title;
      }
    }

    return context;
  } catch (error) {
    console.error("Entity context extraction error:", error);
    return {};
  }
}

// CRM Tool Definitions
const crmTools = [
  {
    name: "create_contact",
    description:
      "Create a new contact in the CRM with name, email, phone, and company",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Contact's full name" },
        email: { type: "string", description: "Contact's email address" },
        phone: { type: "string", description: "Contact's phone number" },
        company: { type: "string", description: "Contact's company name" },
        title: { type: "string", description: "Contact's job title" },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_company",
    description: "Create a new company in the CRM",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Company name" },
        website: { type: "string", description: "Company website URL" },
        industry: { type: "string", description: "Industry sector" },
        size: { type: "string", description: "Company size" },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_deal",
    description: "Create a new deal/opportunity in the CRM",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Deal title" },
        value: { type: "number", description: "Deal value in dollars" },
        stage: {
          type: "string",
          description: "Deal stage",
          enum: ["lead", "qualified", "proposal", "negotiation", "closed"],
        },
        contactId: {
          type: "number",
          description: "Associated contact ID (optional)",
        },
        companyId: {
          type: "number",
          description: "Associated company ID (optional)",
        },
        expectedCloseDate: {
          type: "string",
          description: "Expected close date (ISO format)",
        },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["title", "value", "stage"],
    },
  },
  {
    name: "update_contact",
    description: "Update an existing contact's information",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "number", description: "Contact ID to update" },
        name: { type: "string", description: "Updated name" },
        email: { type: "string", description: "Updated email" },
        phone: { type: "string", description: "Updated phone" },
        company: { type: "string", description: "Updated company" },
        title: { type: "string", description: "Updated job title" },
        notes: { type: "string", description: "Updated notes" },
      },
      required: ["contactId"],
    },
  },
  {
    name: "update_company",
    description: "Update an existing company's information",
    input_schema: {
      type: "object",
      properties: {
        companyId: { type: "number", description: "Company ID to update" },
        name: { type: "string", description: "Updated name" },
        website: { type: "string", description: "Updated website" },
        industry: { type: "string", description: "Updated industry" },
        size: { type: "string", description: "Updated size" },
        notes: { type: "string", description: "Updated notes" },
      },
      required: ["companyId"],
    },
  },
  {
    name: "update_deal",
    description: "Update an existing deal's information",
    input_schema: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "Deal ID to update" },
        title: { type: "string", description: "Updated title" },
        value: { type: "number", description: "Updated value" },
        stage: {
          type: "string",
          description: "Updated stage",
          enum: ["lead", "qualified", "proposal", "negotiation", "closed"],
        },
        contactId: { type: "number", description: "Updated contact ID" },
        companyId: { type: "number", description: "Updated company ID" },
        expectedCloseDate: {
          type: "string",
          description: "Updated expected close date",
        },
        notes: { type: "string", description: "Updated notes" },
      },
      required: ["dealId"],
    },
  },
  {
    name: "search_contacts",
    description: "Search for contacts by name, email, or company",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: {
          type: "number",
          description: "Maximum number of results",
          default: 10,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_companies",
    description: "Search for companies by name or industry",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: {
          type: "number",
          description: "Maximum number of results",
          default: 10,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_deals",
    description: "Search for deals by title or stage",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        stage: {
          type: "string",
          description: "Filter by deal stage",
          enum: ["lead", "qualified", "proposal", "negotiation", "closed"],
        },
        limit: {
          type: "number",
          description: "Maximum number of results",
          default: 10,
        },
      },
      required: [],
    },
  },
  {
    name: "get_contact_details",
    description: "Get detailed information about a specific contact",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "number", description: "Contact ID" },
      },
      required: ["contactId"],
    },
  },
  {
    name: "get_company_details",
    description: "Get detailed information about a specific company",
    input_schema: {
      type: "object",
      properties: {
        companyId: { type: "number", description: "Company ID" },
      },
      required: ["companyId"],
    },
  },
  {
    name: "get_deal_details",
    description: "Get detailed information about a specific deal",
    input_schema: {
      type: "object",
      properties: {
        dealId: { type: "number", description: "Deal ID" },
      },
      required: ["dealId"],
    },
  },
  {
    name: "send_email",
    description: "Send an email to a contact",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body content" },
        contactId: {
          type: "number",
          description: "Associated contact ID (optional)",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "create_activity",
    description: "Create a new activity (meeting, call, task) in the CRM",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Activity type",
          enum: ["meeting", "call", "email", "task"],
        },
        title: { type: "string", description: "Activity title" },
        description: { type: "string", description: "Activity description" },
        dueDate: {
          type: "string",
          description: "Due date (ISO format, optional)",
        },
        contactId: {
          type: "number",
          description: "Associated contact ID (optional)",
        },
        dealId: {
          type: "number",
          description: "Associated deal ID (optional)",
        },
      },
      required: ["type", "title"],
    },
  },
];

async function executeTool(
  toolName: string,
  toolInput: any,
  userId: number
): Promise<any> {
  console.log(`Executing tool: ${toolName}`, toolInput);

  try {
    switch (toolName) {
      case "create_contact": {
        const [contact] = await db
          .insert(contacts)
          .values({
            userId,
            name: toolInput.name,
            email: toolInput.email || null,
            phone: toolInput.phone || null,
            company: toolInput.company || null,
            title: toolInput.title || null,
            notes: toolInput.notes || null,
          })
          .returning();
        return {
          success: true,
          contact,
          message: `Created contact: ${contact.name}`,
        };
      }

      case "create_company": {
        const [company] = await db
          .insert(companies)
          .values({
            userId,
            name: toolInput.name,
            website: toolInput.website || null,
            industry: toolInput.industry || null,
            size: toolInput.size || null,
            notes: toolInput.notes || null,
          })
          .returning();
        return {
          success: true,
          company,
          message: `Created company: ${company.name}`,
        };
      }

      case "create_deal": {
        const [deal] = await db
          .insert(deals)
          .values({
            userId,
            title: toolInput.title,
            value: toolInput.value?.toString() || "0",
            stage: toolInput.stage,
            contactId: toolInput.contactId || null,
            companyId: toolInput.companyId || null,
            expectedCloseDate: toolInput.expectedCloseDate
              ? new Date(toolInput.expectedCloseDate)
              : null,
            notes: toolInput.notes || null,
          })
          .returning();
        return { success: true, deal, message: `Created deal: ${deal.title}` };
      }

      case "update_contact": {
        const updateData: any = {};
        if (toolInput.name) updateData.name = toolInput.name;
        if (toolInput.email !== undefined) updateData.email = toolInput.email;
        if (toolInput.phone !== undefined) updateData.phone = toolInput.phone;
        if (toolInput.company !== undefined)
          updateData.company = toolInput.company;
        if (toolInput.title !== undefined) updateData.title = toolInput.title;
        if (toolInput.notes !== undefined) updateData.notes = toolInput.notes;

        const [contact] = await db
          .update(contacts)
          .set(updateData)
          .where(
            and(
              eq(contacts.id, toolInput.contactId),
              eq(contacts.userId, userId)
            )
          )
          .returning();

        if (!contact) {
          return { success: false, message: "Contact not found" };
        }

        return {
          success: true,
          contact,
          message: `Updated contact: ${contact.name}`,
        };
      }

      case "update_company": {
        const updateData: any = {};
        if (toolInput.name) updateData.name = toolInput.name;
        if (toolInput.website !== undefined)
          updateData.website = toolInput.website;
        if (toolInput.industry !== undefined)
          updateData.industry = toolInput.industry;
        if (toolInput.size !== undefined) updateData.size = toolInput.size;
        if (toolInput.notes !== undefined) updateData.notes = toolInput.notes;

        const [company] = await db
          .update(companies)
          .set(updateData)
          .where(
            and(
              eq(companies.id, toolInput.companyId),
              eq(companies.userId, userId)
            )
          )
          .returning();

        if (!company) {
          return { success: false, message: "Company not found" };
        }

        return {
          success: true,
          company,
          message: `Updated company: ${company.name}`,
        };
      }

      case "update_deal": {
        const updateData: any = {};
        if (toolInput.title) updateData.title = toolInput.title;
        if (toolInput.value !== undefined)
          updateData.value = toolInput.value.toString();
        if (toolInput.stage) updateData.stage = toolInput.stage;
        if (toolInput.contactId !== undefined)
          updateData.contactId = toolInput.contactId;
        if (toolInput.companyId !== undefined)
          updateData.companyId = toolInput.companyId;
        if (toolInput.expectedCloseDate !== undefined)
          updateData.expectedCloseDate = toolInput.expectedCloseDate
            ? new Date(toolInput.expectedCloseDate)
            : null;
        if (toolInput.notes !== undefined) updateData.notes = toolInput.notes;

        const [deal] = await db
          .update(deals)
          .set(updateData)
          .where(and(eq(deals.id, toolInput.dealId), eq(deals.userId, userId)))
          .returning();

        if (!deal) {
          return { success: false, message: "Deal not found" };
        }

        return {
          success: true,
          deal,
          message: `Updated deal: ${deal.title}`,
        };
      }

      case "search_contacts": {
        const results = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.userId, userId),
              or(
                sql`LOWER(${contacts.name}) LIKE LOWER(${`%${toolInput.query}%`})`,
                sql`LOWER(${contacts.email}) LIKE LOWER(${`%${toolInput.query}%`})`,
                sql`LOWER(${contacts.company}) LIKE LOWER(${`%${toolInput.query}%`})`
              )
            )
          )
          .limit(toolInput.limit || 10);

        return {
          success: true,
          contacts: results,
          count: results.length,
          message: `Found ${results.length} contacts`,
        };
      }

      case "search_companies": {
        const results = await db
          .select()
          .from(companies)
          .where(
            and(
              eq(companies.userId, userId),
              or(
                sql`LOWER(${companies.name}) LIKE LOWER(${`%${toolInput.query}%`})`,
                sql`LOWER(${companies.industry}) LIKE LOWER(${`%${toolInput.query}%`})`
              )
            )
          )
          .limit(toolInput.limit || 10);

        return {
          success: true,
          companies: results,
          count: results.length,
          message: `Found ${results.length} companies`,
        };
      }

      case "search_deals": {
        let query = db
          .select()
          .from(deals)
          .where(eq(deals.userId, userId))
          .$dynamic();

        if (toolInput.query) {
          query = query.where(
            sql`LOWER(${deals.title}) LIKE LOWER(${`%${toolInput.query}%`})`
          );
        }

        if (toolInput.stage) {
          query = query.where(eq(deals.stage, toolInput.stage));
        }

        const results = await query.limit(toolInput.limit || 10);

        return {
          success: true,
          deals: results,
          count: results.length,
          message: `Found ${results.length} deals`,
        };
      }

      case "get_contact_details": {
        const [contact] = await db
          .select()
          .from(contacts)
          .where(
            and(
              eq(contacts.id, toolInput.contactId),
              eq(contacts.userId, userId)
            )
          );

        if (!contact) {
          return { success: false, message: "Contact not found" };
        }

        const relatedActivities = await db
          .select()
          .from(activities)
          .where(
            and(
              eq(activities.contactId, contact.id),
              eq(activities.userId, userId)
            )
          )
          .orderBy(desc(activities.createdAt))
          .limit(10);

        const relatedDeals = await db
          .select()
          .from(deals)
          .where(
            and(eq(deals.contactId, contact.id), eq(deals.userId, userId))
          );

        return {
          success: true,
          contact,
          activities: relatedActivities,
          deals: relatedDeals,
          message: `Retrieved details for ${contact.name}`,
        };
      }

      case "get_company_details": {
        const [company] = await db
          .select()
          .from(companies)
          .where(
            and(
              eq(companies.id, toolInput.companyId),
              eq(companies.userId, userId)
            )
          );

        if (!company) {
          return { success: false, message: "Company not found" };
        }

        const relatedContacts = await db
          .select()
          .from(contacts)
          .where(
            and(
              sql`LOWER(${contacts.company}) = LOWER(${company.name})`,
              eq(contacts.userId, userId)
            )
          );

        const relatedDeals = await db
          .select()
          .from(deals)
          .where(
            and(eq(deals.companyId, company.id), eq(deals.userId, userId))
          );

        return {
          success: true,
          company,
          contacts: relatedContacts,
          deals: relatedDeals,
          message: `Retrieved details for ${company.name}`,
        };
      }

      case "get_deal_details": {
        const [deal] = await db
          .select()
          .from(deals)
          .where(and(eq(deals.id, toolInput.dealId), eq(deals.userId, userId)));

        if (!deal) {
          return { success: false, message: "Deal not found" };
        }

        let contact = null;
        if (deal.contactId) {
          [contact] = await db
            .select()
            .from(contacts)
            .where(eq(contacts.id, deal.contactId));
        }

        let company = null;
        if (deal.companyId) {
          [company] = await db
            .select()
            .from(companies)
            .where(eq(companies.id, deal.companyId));
        }

        const relatedActivities = await db
          .select()
          .from(activities)
          .where(
            and(eq(activities.dealId, deal.id), eq(activities.userId, userId))
          )
          .orderBy(desc(activities.createdAt))
          .limit(10);

        return {
          success: true,
          deal,
          contact,
          company,
          activities: relatedActivities,
          message: `Retrieved details for deal: ${deal.title}`,
        };
      }

      case "send_email": {
        const transporter = nodemailer.createTransporter(emailConfig);

        await transporter.sendMail({
          from: emailConfig.auth.user,
          to: toolInput.to,
          subject: toolInput.subject,
          text: toolInput.body,
          html: toolInput.body.replace(/\n/g, "<br>"),
        });

        if (toolInput.contactId) {
          await db.insert(activities).values({
            userId,
            type: "email",
            title: `Email: ${toolInput.subject}`,
            description: toolInput.body,
            contactId: toolInput.contactId,
            completed: true,
          });
        }

        return {
          success: true,
          message: `Email sent to ${toolInput.to}`,
        };
      }

      case "create_activity": {
        const [activity] = await db
          .insert(activities)
          .values({
            userId,
            type: toolInput.type,
            title: toolInput.title,
            description: toolInput.description || null,
            dueDate: toolInput.dueDate ? new Date(toolInput.dueDate) : null,
            contactId: toolInput.contactId || null,
            dealId: toolInput.dealId || null,
            completed: false,
          })
          .returning();

        return {
          success: true,
          activity,
          message: `Created ${toolInput.type}: ${activity.title}`,
        };
      }

      default:
        return { success: false, message: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`Tool execution error for ${toolName}:`, error);
    return { success: false, message: error.message };
  }
}

async function generateAssistantResponse(
  userMessage: string,
  conversationHistory: any[],
  userId: number,
  model: string = "claude-3-5-sonnet-20241022",
  entityContext?: EntityContext,
  classifiedIntent?: ClassifiedIntent
): Promise<{ content: string; metadata: any }> {
  const userContext = await getUserContext(userId);

  const systemPrompt = `You are Aisha, an intelligent CRM assistant. You help users manage their contacts, companies, deals, and activities efficiently.

${userContext}

Current Context:
${
  entityContext && Object.keys(entityContext).length > 0
    ? `- Currently discussing: ${JSON.stringify(entityContext, null, 2)}`
    : ""
}
${
  classifiedIntent
    ? `- Detected intent: ${classifiedIntent.primary} (confidence: ${classifiedIntent.confidence})
- Suggested action: ${classifiedIntent.suggestedAction || "N/A"}`
    : ""
}

Guidelines:
1. Be conversational and helpful
2. Use the available tools to perform CRM operations
3. When users mention entities from their CRM (contacts, companies, deals), recognize them from the context
4. Ask for clarification when needed
5. Confirm important actions before executing them
6. Provide summaries after completing operations
7. Use the entity context to understand references like "them", "it", "that deal"

Available Tools: You have access to tools for creating, updating, searching, and managing contacts, companies, deals, and activities. Use them proactively to help the user.`;

  const messages = [
    ...conversationHistory.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  try {
    let response;
    let toolResults: any[] = [];

    if (model.startsWith("claude")) {
      // Claude API
      response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: crmTools,
      });

      let currentResponse = response;
      const maxIterations = 5;
      let iterations = 0;

      while (
        currentResponse.stop_reason === "tool_use" &&
        iterations < maxIterations
      ) {
        iterations++;
        const toolUseBlocks = currentResponse.content.filter(
          (block: any) => block.type === "tool_use"
        );

        const toolResultsForRequest = await Promise.all(
          toolUseBlocks.map(async (toolUse: any) => {
            const result = await executeTool(
              toolUse.name,
              toolUse.input,
              userId
            );
            toolResults.push({ tool: toolUse.name, result });
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            };
          })
        );

        const continueMessages = [
          ...messages,
          { role: "assistant", content: currentResponse.content },
          { role: "user", content: toolResultsForRequest },
        ];

        currentResponse = await anthropic.messages.create({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: continueMessages,
          tools: crmTools,
        });
      }

      const textContent = currentResponse.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("\n");

      return {
        content: textContent,
        metadata: {
          model,
          toolsUsed: toolResults,
          stopReason: currentResponse.stop_reason,
          entityContext,
          intent: classifiedIntent || null,
        },
      };
    } else if (model.startsWith("gpt")) {
      // OpenAI API
      const openaiMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];

      response = await openai.chat.completions.create({
        model,
        messages: openaiMessages as any,
        tools: crmTools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
          },
        })),
        tool_choice: "auto",
      });

      let currentResponse = response;
      const maxIterations = 5;
      let iterations = 0;
      const allMessages = [...openaiMessages];

      while (
        currentResponse.choices[0].message.tool_calls &&
        iterations < maxIterations
      ) {
        iterations++;
        const toolCalls = currentResponse.choices[0].message.tool_calls;

        allMessages.push(currentResponse.choices[0].message as any);

        const toolResultsForRequest = await Promise.all(
          toolCalls.map(async (toolCall: any) => {
            const result = await executeTool(
              toolCall.function.name,
              JSON.parse(toolCall.function.arguments),
              userId
            );
            toolResults.push({ tool: toolCall.function.name, result });
            return {
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            };
          })
        );

        allMessages.push(...toolResultsForRequest);

        currentResponse = await openai.chat.completions.create({
          model,
          messages: allMessages as any,
          tools: crmTools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema,
            },
          })),
          tool_choice: "auto",
        });
      }

      return {
        content: currentResponse.choices[0].message.content || "",
        metadata: {
          model,
          toolsUsed: toolResults,
          stopReason: currentResponse.choices[0].finish_reason,
          entityContext,
          intent: classifiedIntent || null,
        },
      };
    } else {
      // Groq API (fallback to non-tool usage for unsupported models)
      const groqMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];

      response = await groq.chat.completions.create({
        model: model === "llama-3.1-70b" ? "llama-3.1-70b-versatile" : model,
        messages: groqMessages as any,
        temperature: 0.7,
        max_tokens: 4096,
      });

      return {
        content: response.choices[0].message.content || "",
        metadata: {
          model,
          toolsUsed: [],
          stopReason: response.choices[0].finish_reason,
          entityContext,
          intent: classifiedIntent || null,
        },
      };
    }
  } catch (error: any) {
    console.error("Assistant response error:", error);
    throw new Error(`Failed to generate response: ${error.message}`);
  }
}

// Conversation routes
router.get("/conversations", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt));

    res.json(userConversations);
  } catch (error: any) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/conversations", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { title } = req.body;

    const [conversation] = await db
      .insert(conversations)
      .values({
        userId,
        title: title || "New Conversation",
      })
      .returning();

    res.json(conversation);
  } catch (error: any) {
    console.error("Error creating conversation:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/conversations/:id/messages", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const conversationId = parseInt(req.params.id);

    const conversation = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        )
      )
      .limit(1);

    if (conversation.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const conversationMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));

    res.json(conversationMessages);
  } catch (error: any) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/conversations/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const conversationId = parseInt(req.params.id);

    await db
      .delete(messages)
      .where(eq(messages.conversationId, conversationId));

    await db
      .delete(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId)
        )
      );

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting conversation:", error);
    res.status(500).json({ error: error.message });
  }
});

// Chat endpoint
router.post("/chat", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { message, conversationId, model = "claude-3-5-sonnet-20241022" } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    let currentConversationId = conversationId;

    if (!currentConversationId) {
      const [newConversation] = await db
        .insert(conversations)
        .values({
          userId,
          title: message.slice(0, 50),
        })
        .returning();
      currentConversationId = newConversation.id;
    }

    const conversationHistory = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, currentConversationId))
      .orderBy(asc(messages.createdAt));

    // Classify intent
    const classifiedIntent = await classifyIntent(
      message,
      conversationHistory
    );

    // Extract entity context from the current message and history
    const entityContext = await extractEntityContext(
      message,
      userId,
      conversationHistory
    );

    // Enhanced context carry-forward: look for entity context in recent conversation history
    let carriedEntityContext = { ...entityContext };
    
    // Look through recent assistant messages for entity context in metadata
    for (let i = conversationHistory.length - 1; i >= Math.max(0, conversationHistory.length - 5); i--) {
      const msg = conversationHistory[i];
      if (msg.role === 'assistant' && msg.metadata) {
        const metadata = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
        
        // Carry forward entity context if we haven't found one yet
        if (metadata.entityContext) {
          if (!carriedEntityContext.contactId && metadata.entityContext.contactId) {
            carriedEntityContext.contactId = metadata.entityContext.contactId;
            carriedEntityContext.contactName = metadata.entityContext.contactName;
          }
          if (!carriedEntityContext.companyId && metadata.entityContext.companyId) {
            carriedEntityContext.companyId = metadata.entityContext.companyId;
            carriedEntityContext.companyName = metadata.entityContext.companyName;
          }
          if (!carriedEntityContext.dealId && metadata.entityContext.dealId) {
            carriedEntityContext.dealId = metadata.entityContext.dealId;
            carriedEntityContext.dealTitle = metadata.entityContext.dealTitle;
          }
        }
        
        // Stop if we have all possible entity types
        if (carriedEntityContext.contactId && carriedEntityContext.companyId && carriedEntityContext.dealId) {
          break;
        }
      }
    }

    await db.insert(messages).values({
      conversationId: currentConversationId,
      role: "user",
      content: message,
    });

    const { content: assistantMessage, metadata } =
      await generateAssistantResponse(
        message,
        conversationHistory,
        userId,
        model,
        carriedEntityContext,
        classifiedIntent
      );

    await db.insert(messages).values({
      conversationId: currentConversationId,
      role: "assistant",
      content: assistantMessage,
      metadata: metadata,
    });

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, currentConversationId));

    res.json({
      conversationId: currentConversationId,
      message: assistantMessage,
      metadata: {
        ...metadata,
        intent: classifiedIntent || null,
      },
    });
  } catch (error: any) {
    console.error("Error in chat:", error);
    res.status(500).json({ error: error.message });
  }
});

// Subscription check middleware
async function checkSubscription(req: Request, res: Response, next: any) {
  try {
    const userId = (req as any).user.id;

    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user.stripeSubscriptionId) {
      return res
        .status(403)
        .json({ error: "Active subscription required" });
    }

    const subscription = await stripe.subscriptions.retrieve(
      user.stripeSubscriptionId
    );

    if (subscription.status !== "active" && subscription.status !== "trialing") {
      return res
        .status(403)
        .json({ error: "Active subscription required" });
    }

    next();
  } catch (error: any) {
    console.error("Subscription check error:", error);
    res.status(500).json({ error: "Failed to verify subscription" });
  }
}

router.use("/chat", checkSubscription);

// Email Intelligence Routes
router.get("/emails", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const integration = await db
      .select()
      .from(emailIntegrations)
      .where(eq(emailIntegrations.userId, userId))
      .limit(1);

    if (integration.length === 0) {
      return res.status(404).json({ error: "Email integration not found" });
    }

    res.json({ provider: integration[0].provider, email: integration[0].email });
  } catch (error: any) {
    console.error("Error fetching email integration:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/emails/analyze", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { emailContent, emailSubject, from } = req.body;

    if (!emailContent) {
      return res.status(400).json({ error: "Email content is required" });
    }

    const analysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an email analysis assistant. Analyze the email and extract:
1. Sentiment (positive, neutral, negative)
2. Priority (high, medium, low)
3. Key topics and entities mentioned
4. Suggested actions
5. Whether it requires immediate attention

Respond in JSON format.`,
        },
        {
          role: "user",
          content: `Subject: ${emailSubject}\nFrom: ${from}\n\n${emailContent}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(analysis.choices[0].message.content || "{}");

    res.json(result);
  } catch (error: any) {
    console.error("Error analyzing email:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/emails/draft", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { context, tone = "professional", purpose } = req.body;

    if (!context || !purpose) {
      return res
        .status(400)
        .json({ error: "Context and purpose are required" });
    }

    const userContext = await getUserContext(userId);

    const draft = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an email drafting assistant. Create professional email drafts based on the user's context and requirements.

Tone: ${tone}
${userContext}

Generate a complete email with subject line and body.`,
        },
        {
          role: "user",
          content: `Purpose: ${purpose}\nContext: ${context}`,
        },
      ],
    });

    const draftContent = draft.choices[0].message.content || "";

    res.json({ draft: draftContent });
  } catch (error: any) {
    console.error("Error drafting email:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
