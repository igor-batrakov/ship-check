import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";

// PLANTED VULN (data-access): client created with the SERVICE_ROLE key — it BYPASSES RLS.
// Used inside a user request handler.
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  // PLANTED VULN (data-access/IDOR): fetch an order by id WITHOUT an ownership check —
  // any user reads others' orders.
  // PLANTED VULN (websec/SQL injection): input concatenated straight into SQL.
  const result = await pool.query(
    "SELECT * FROM orders WHERE id = " + id
  );

  // service_role bypasses RLS, so there's no owner filter here either.
  const { data } = await supabase.from("orders").select("*");

  return Response.json({ result: result.rows, all: data });
}

export async function POST(req: Request) {
  // PLANTED VULN (websec): no server-side validation — the body is accepted as-is
  // (the client validates, but that can be bypassed by disabling JS).
  const body = await req.json();
  await supabase.from("orders").insert(body);
  return Response.json({ ok: true });
}
