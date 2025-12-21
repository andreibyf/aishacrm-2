// orchestra/core/llmClient.ts
import "dotenv/config";
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is not set in environment or .env file");
}

const client = new OpenAI({
  apiKey,
});

export async function callLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
  });

  const content = res.choices[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("LLM returned no content");
  }
  return content;
}
