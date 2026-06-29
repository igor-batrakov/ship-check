import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

export async function POST(req: Request) {
  const { email } = await req.json();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  // email exists (user enumeration). It should be a neutral response.
  if (!user) {
    return Response.json({ error: "No account with that email" }, { status: 404 });
  }

  const token = crypto.randomUUID();
  console.log("reset token for", email, "=", token);

  return Response.json({ ok: true });
}
