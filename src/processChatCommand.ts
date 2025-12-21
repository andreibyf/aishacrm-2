import { extractDateTimeAndLead } from "./services/nlpParser";
import {
  checkCalendarConflict,
  createCalendarEvent,
  findNextAvailableSlot,
} from "./services/calendarService";
import { db } from "./db";

// In-memory pending action store for frontend
// Backend uses Redis via pendingActionStore.ts
const pendingActions = new Map<string, PendingAction>();

interface PendingAction {
  type: string;
  tenantId: string;
  leadId: string;
  leadName: string;
  datetime: string;
}

interface ProcessChatCommandParams {
  userText: string;
  tenantId: string;
  conversationId?: string;
  classification?: { intent: string };
}

interface ChatResponse {
  type: "ai_chat" | "ai_brain";
  response: string;
}

export async function processChatCommand({
  userText,
  tenantId,
  conversationId = "default",
  classification,
}: ProcessChatCommandParams): Promise<ChatResponse> {
  const txt = userText.trim().toLowerCase();

  // ========= STEP 1: Check for pending action and handle confirmation =========
  const pending = pendingActions.get(conversationId);

  if (pending) {
    // User confirms with "yes", "yep", "confirm", "do it", "go ahead"
    if (/^(yes|yep|confirm|do it|go ahead)$/i.test(txt)) {
      pendingActions.delete(conversationId);

      await createCalendarEvent({
        tenantId: pending.tenantId,
        leadId: pending.leadId,
        datetime: pending.datetime,
      });

      return {
        type: "ai_brain",
        response: `Call with ${pending.leadName} has been successfully scheduled for ${new Date(pending.datetime).toLocaleString()}.`,
      };
    }

    // User wants to reschedule
    if (/reschedule|change time|move|different time/i.test(txt)) {
      const nextSlot = await findNextAvailableSlot(pending.tenantId, pending.datetime);

      pending.datetime = nextSlot;
      pendingActions.set(conversationId, pending);

      return {
        type: "ai_chat",
        response: `Suggested new time: ${new Date(nextSlot).toLocaleString()}. Should I proceed with this time?`,
      };
    }

    // User cancels
    if (/^(no|cancel|nevermind|forget it)$/i.test(txt)) {
      pendingActions.delete(conversationId);
      return {
        type: "ai_chat",
        response: "No problem, I've cancelled the scheduling request.",
      };
    }
  }

  // ========= STEP 2: Handle schedule_call intent =========
  if (classification?.intent === "schedule_call") {
    const parsed = extractDateTimeAndLead(userText);

    const lead = await db.leads.findFirst({
      where: {
        tenantId,
        name: { contains: parsed.leadName || "" },
      },
    });

    if (!lead) {
      return {
        type: "ai_chat",
        response: "I couldn't find that lead. Who should the call be with?",
      };
    }

    const conflict = await checkCalendarConflict(tenantId, parsed.datetime);

    if (conflict) {
      // Store pending action for reschedule flow
      pendingActions.set(conversationId, {
        type: "schedule_call",
        tenantId,
        leadId: lead.id,
        leadName: lead.name,
        datetime: parsed.datetime,
      });

      return {
        type: "ai_chat",
        response: `There's a conflict at ${new Date(parsed.datetime).toLocaleString()}. Should I find another time?`,
      };
    }

    // No conflict - ask for confirmation before scheduling
    pendingActions.set(conversationId, {
      type: "schedule_call",
      tenantId,
      leadId: lead.id,
      leadName: lead.name,
      datetime: parsed.datetime,
    });

    return {
      type: "ai_chat",
      response: `I'll schedule a call with ${lead.name} for ${new Date(parsed.datetime).toLocaleString()}. Should I proceed?`,
    };
  }

  // ========= STEP 3: Unknown intent =========
  return {
    type: "ai_chat",
    response: "I didn't understand that command.",
  };
}
