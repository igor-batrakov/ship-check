import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// and NO rate limiting. Anyone can loop it on the owner's dime.
export async function POST(req: Request) {
  const { prompt } = await req.json();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
  });
  return new Response(JSON.stringify(completion), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
