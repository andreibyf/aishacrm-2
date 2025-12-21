import { describe, it, expect, vi, beforeEach } from "vitest";
import { processChatCommand } from "@/processChatCommand";

// ========= MOCKS =========

vi.mock("@/services/nlpParser", () => ({
  extractDateTimeAndLead: vi.fn(),
}));

vi.mock("@/services/calendarService", () => ({
  checkCalendarConflict: vi.fn(),
  createCalendarEvent: vi.fn(),
  findNextAvailableSlot: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    leads: {
      findFirst: vi.fn(),
    },
  },
}));

// ========= IMPORT MOCKED FUNCTIONS =========

import { extractDateTimeAndLead } from "@/services/nlpParser";
import { checkCalendarConflict, createCalendarEvent, findNextAvailableSlot } from "@/services/calendarService";
import { db } from "@/db";

// ========= TEST DATA =========

const tenantId = "tenant-123";
const conversationId = "conv-123";

const lead = {
  id: "lead-1",
  name: "Jennifer Martinez",
};

const baseScheduleInput = "Schedule a call with Jennifer Monday at 3pm";
const parsedDate = "2025-03-10T15:00:00.000Z";

// ========= RESET Mocks =========

beforeEach(() => {
  vi.resetAllMocks();
});

// ========= TESTS =========

describe("processChatCommand - Scheduling Flow", () => {
  it("creates a pending schedule action and asks for confirmation", async () => {
    (extractDateTimeAndLead as any).mockReturnValue({
      leadName: "Jennifer Martinez",
      datetime: parsedDate,
    });

    (db.leads.findFirst as any).mockResolvedValue(lead);
    (checkCalendarConflict as any).mockResolvedValue(false);

    const result = await processChatCommand({
      userText: baseScheduleInput,
      tenantId,
      conversationId,
      classification: { intent: "schedule_call" },
    });

    expect(result.type).toBe("ai_chat");
    expect(result.response).toContain("Should I proceed");
  });

  it("executes schedule when user confirms with yes", async () => {
    (extractDateTimeAndLead as any).mockReturnValue({
      leadName: "Jennifer Martinez",
      datetime: parsedDate,
    });

    (db.leads.findFirst as any).mockResolvedValue(lead);
    (checkCalendarConflict as any).mockResolvedValue(false);

    // First call - create pending action
    await processChatCommand({
      userText: baseScheduleInput,
      tenantId,
      conversationId,
      classification: { intent: "schedule_call" },
    });

    // Second call - confirm
    const result = await processChatCommand({
      userText: "yes",
      tenantId,
      conversationId,
    });

    expect(createCalendarEvent).toHaveBeenCalledWith({
      tenantId,
      leadId: lead.id,
      datetime: parsedDate,
    });

    expect(result.type).toBe("ai_brain");
    expect(result.response).toContain("successfully scheduled");
  });

  it("handles conflict and offers reschedule", async () => {
    (extractDateTimeAndLead as any).mockReturnValue({
      leadName: "Jennifer Martinez",
      datetime: parsedDate,
    });

    (db.leads.findFirst as any).mockResolvedValue(lead);
    (checkCalendarConflict as any).mockResolvedValue(true);

    const result = await processChatCommand({
      userText: baseScheduleInput,
      tenantId,
      conversationId,
      classification: { intent: "schedule_call" },
    });

    expect(result.type).toBe("ai_chat");
    expect(result.response).toContain("conflict");
  });

  it("handles reschedule request", async () => {
    const newSlot = "2025-03-10T15:30:00.000Z";

    (extractDateTimeAndLead as any).mockReturnValue({
      leadName: "Jennifer Martinez",
      datetime: parsedDate,
    });

    (db.leads.findFirst as any).mockResolvedValue(lead);
    (checkCalendarConflict as any).mockResolvedValue(true);
    (findNextAvailableSlot as any).mockResolvedValue(newSlot);

    // Create conflict state
    await processChatCommand({
      userText: baseScheduleInput,
      tenantId,
      conversationId,
      classification: { intent: "schedule_call" },
    });

    const result = await processChatCommand({
      userText: "reschedule",
      tenantId,
      conversationId,
    });

    expect(findNextAvailableSlot).toHaveBeenCalled();
    expect(result.type).toBe("ai_chat");
    expect(result.response).toContain("Suggested new time");
  });

  it("handles cancel request", async () => {
    (extractDateTimeAndLead as any).mockReturnValue({
      leadName: "Jennifer Martinez",
      datetime: parsedDate,
    });

    (db.leads.findFirst as any).mockResolvedValue(lead);
    (checkCalendarConflict as any).mockResolvedValue(false);

    // Create pending action
    await processChatCommand({
      userText: baseScheduleInput,
      tenantId,
      conversationId,
      classification: { intent: "schedule_call" },
    });

    // Cancel
    const result = await processChatCommand({
      userText: "cancel",
      tenantId,
      conversationId,
    });

    expect(result.type).toBe("ai_chat");
    expect(result.response).toContain("cancelled");
  });

  it("returns error when lead not found", async () => {
    (extractDateTimeAndLead as any).mockReturnValue({
      leadName: "Unknown Person",
      datetime: parsedDate,
    });

    (db.leads.findFirst as any).mockResolvedValue(null);

    const result = await processChatCommand({
      userText: "Schedule a call with Unknown Person tomorrow",
      tenantId,
      conversationId,
      classification: { intent: "schedule_call" },
    });

    expect(result.type).toBe("ai_chat");
    expect(result.response).toContain("couldn't find that lead");
  });

  it("returns unknown command for unrecognized intent", async () => {
    const result = await processChatCommand({
      userText: "Some random text",
      tenantId,
      conversationId,
      classification: { intent: "unknown" },
    });

    expect(result.type).toBe("ai_chat");
    expect(result.response).toContain("didn't understand");
  });
});
