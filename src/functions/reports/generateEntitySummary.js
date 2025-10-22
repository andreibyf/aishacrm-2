/**
 * generateEntitySummary
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';
import OpenAI from 'npm:openai@5.20.3';

// Initialize OpenAI client with the dedicated summary key
const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_SUMMARY_API_KEY"),
});

// Helper to get the correct entity model from the SDK
const getEntityModel = (base44, entityType) => {
    const mapping = {
        'Contact': base44.entities.Contact,
        'Account': base44.entities.Account,
        'Lead': base44.entities.Lead,
        'Opportunity': base44.entities.Opportunity,
    };
    const model = mapping[entityType];
    if (!model) {
        throw new Error(`Invalid entity type provided: ${entityType}`);
    }
    return model;
};

// Main function logic
Deno.serve(async (req) => {
    try {
        const { entity_type, entity_id, summary_type } = await req.json();
        
        if (!entity_type || !entity_id || !summary_type) {
            return new Response(JSON.stringify({ success: false, error: "Missing required parameters." }), { status: 400 });
        }
        
        // Authenticate user and get service role client
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return new Response(JSON.stringify({ success: false, error: "Unauthorized." }), { status: 401 });
        }
        const serviceClient = base44.asServiceRole;
        
        // Fetch the main entity record
        const EntityModel = getEntityModel(serviceClient, entity_type);
        const entityRecord = await EntityModel.get(entity_id);
        
        if (!entityRecord) {
            return new Response(JSON.stringify({ success: false, error: `${entity_type} not found.` }), { status: 404 });
        }

        // Fetch related data (notes and activities)
        const [notes, activities] = await Promise.all([
            serviceClient.entities.Note.filter({ related_to: entity_type.toLowerCase(), related_id: entity_id }),
            serviceClient.entities.Activity.filter({ related_to: entity_type.toLowerCase(), related_id: entity_id }, '-created_date', 5)
        ]);

        // Construct a detailed prompt for the LLM
        let prompt = `You are a helpful CRM assistant. Your task is to generate a concise, professional summary for a CRM record.
        
User requesting summary: ${user.email}
Summary Type Requested: "${summary_type}"

Please generate a summary based on the following data for the ${entity_type} "${entityRecord.name || `${entityRecord.first_name} ${entityRecord.last_name}`}":

**Main Record Details:**
${JSON.stringify(entityRecord, null, 2)}

**Recent Activities (last 5):**
${activities.length > 0 ? JSON.stringify(activities, null, 2) : "No recent activities."}

**Associated Notes:**
${notes.length > 0 ? JSON.stringify(notes.map(n => ({ title: n.title, content: n.content })), null, 2) : "No notes."}

Based on the requested summary type "${summary_type}", provide a well-structured summary in markdown format.
- For 'overview', give a general summary of the entity.
- For 'activity', focus on the recent interactions.
- For 'insights', analyze the data and provide actionable recommendations or observations.
- For 'relationship', describe how this entity connects to others (if data is available).
`;

        // Call OpenAI to generate the summary
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: prompt }],
            temperature: 0.5,
        });

        const summaryContent = response.choices[0].message.content;

        return new Response(JSON.stringify({ success: true, summary: summaryContent }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("--- generateEntitySummary Error ---", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), { 
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
});


----------------------------

export default generateEntitySummary;
