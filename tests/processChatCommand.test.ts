import { processChatCommand } from "@/processChatCommand";

// Jest-based tests for the schedule_call flow in processChatCommand.

jest.mock("@/intentClassifier", () => ({
	classifyIntent: jest.fn(),
}));

jest.mock("@/services/nlpParser", () => ({
	extractDateTimeAndLead: jest.fn(),
}));

jest.mock("@/services/calendarService", () => ({
	checkCalendarConflict: jest.fn(),
	createCalendarEvent: jest.fn(),
}));

jest.mock("@/db", () => ({
	db: {
		leads: {
			findFirst: jest.fn(),
		},
	},
}));

import { classifyIntent } from "@/intentClassifier";
import { extractDateTimeAndLead } from "@/services/nlpParser";
import { checkCalendarConflict, createCalendarEvent } from "@/services/calendarService";
import { db } from "@/db";

const tenantId = "tenant-123";
const lead = { id: "lead-1", name: "Jennifer Martinez" };
const baseScheduleInput = "Schedule a call with Jennifer Monday at 3pm";
const parsedDate = "2025-03-10T15:00:00.000Z";

beforeEach(() => {
	jest.resetAllMocks();
});

describe("processChatCommand schedule_call flow (Jest)", () => {
	it("creates a pending schedule action and asks for confirmation", async () => {
		(classifyIntent as jest.Mock).mockReturnValue({ intent: "schedule_call" });
		(extractDateTimeAndLead as jest.Mock).mockReturnValue({
			leadName: "Jennifer Martinez",
			datetime: parsedDate,
		});
		(db.leads.findFirst as jest.Mock).mockResolvedValue(lead);
		(checkCalendarConflict as jest.Mock).mockResolvedValue(false);

		const result = await processChatCommand({
			userText: baseScheduleInput,
			tenantId,
		} as any);

		expect(result.type).toBe("ai_chat");
		expect(result.response).toContain("Should I proceed");
	});

	it("executes schedule when user confirms with yes", async () => {
		(classifyIntent as jest.Mock).mockReturnValue({ intent: "schedule_call" });
		(extractDateTimeAndLead as jest.Mock).mockReturnValue({
			leadName: "Jennifer Martinez",
			datetime: parsedDate,
		});
		(db.leads.findFirst as jest.Mock).mockResolvedValue(lead);
		(checkCalendarConflict as jest.Mock).mockResolvedValue(false);

		await processChatCommand({ userText: baseScheduleInput, tenantId } as any);

		const result = await processChatCommand({ userText: "yes", tenantId } as any);

		expect(createCalendarEvent).toHaveBeenCalled();
		expect(result.type).toBe("ai_brain");
	});

	it("handles conflict and offers reschedule", async () => {
		(classifyIntent as jest.Mock).mockReturnValue({ intent: "schedule_call" });
		(extractDateTimeAndLead as jest.Mock).mockReturnValue({
			leadName: "Jennifer Martinez",
			datetime: parsedDate,
		});
		(db.leads.findFirst as jest.Mock).mockResolvedValue(lead);
		(checkCalendarConflict as jest.Mock).mockResolvedValue(true);

		const result = await processChatCommand({
			userText: baseScheduleInput,
			tenantId,
		} as any);

		expect(result.type).toBe("ai_chat");
		expect(result.response.toLowerCase()).toContain("conflict");
	});
});