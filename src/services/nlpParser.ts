import * as chrono from "chrono-node";

export function extractDateTimeAndLead(text: string) {
  const date = chrono.parseDate(text, new Date(), { forwardDate: true });

  if (!date) {
    throw new Error("No valid date/time found in input.");
  }

  // Example: "Schedule a call with Jennifer Monday at 11"
  const leadMatch = text.match(/with\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);

  return {
    datetime: date.toISOString(),
    leadName: leadMatch?.[1] || null,
  };
}