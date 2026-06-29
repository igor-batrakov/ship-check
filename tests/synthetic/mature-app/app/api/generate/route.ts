import OpenAI from "openai";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { json, preflight } from "@/lib/http";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const RequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
});

export function OPTIONS(): Response {
  return preflight();
}

export async function POST(req: Request): Promise<Response> {
  const auth = await getUser(req);
  if (!auth) {
    return json({ error: "Unauthorized" }, 401);
  }

  const limit = rateLimit(`generate:${auth.user.id}`, 10, 60_000);
  if (!limit.success) {
    return json({ error: "Too many requests, please try again shortly" }, 429);
  }

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "Invalid request" }, 400);
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: parsed.data.prompt }],
  });
  const text = completion.choices[0]?.message?.content ?? "";

  await auth.supabase.from("generations").insert({
    user_id: auth.user.id,
    prompt: parsed.data.prompt,
    response: text,
  });

  return json({ text }, 200);
}
