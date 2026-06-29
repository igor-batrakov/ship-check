import { z } from "zod";
import { anonClient } from "@/lib/supabase";
import { rateLimit } from "@/lib/ratelimit";
import { json, preflight } from "@/lib/http";

export const runtime = "nodejs";

const RequestSchema = z.object({
  email: z.string().email(),
});

// The same neutral response is returned in every branch, so the endpoint never
// reveals whether an account exists for a given address.
const NEUTRAL_MESSAGE =
  "If an account exists for that address, a reset link is on its way.";

export function OPTIONS(): Response {
  return preflight();
}

export async function POST(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const limit = rateLimit(`reset:${ip}`, 5, 15 * 60_000);
  if (!limit.success) {
    return json({ message: NEUTRAL_MESSAGE }, 200);
  }

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json({ message: NEUTRAL_MESSAGE }, 200);
  }

  await anonClient().auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.APP_ORIGIN}/account/reset`,
  });

  return json({ message: NEUTRAL_MESSAGE }, 200);
}
