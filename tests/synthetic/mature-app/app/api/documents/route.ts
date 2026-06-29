import { z } from "zod";
import { getUser } from "@/lib/auth";
import { json, preflight } from "@/lib/http";

export const runtime = "nodejs";

const NewDocumentSchema = z.object({
  name: z.string().min(1).max(200),
});

export function OPTIONS(): Response {
  return preflight();
}

// List the caller's own documents. The user-scoped client runs under RLS, so the
// query returns only rows owned by the signed-in user.
export async function GET(req: Request): Promise<Response> {
  const auth = await getUser(req);
  if (!auth) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data, error } = await auth.supabase
    .from("documents")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return json({ error: "Failed to load documents" }, 500);
  }

  return json({ documents: data }, 200);
}

// Create a document for the caller. The body is validated server-side and the
// owner is taken from the verified session, never from the request payload.
export async function POST(req: Request): Promise<Response> {
  const auth = await getUser(req);
  if (!auth) {
    return json({ error: "Unauthorized" }, 401);
  }

  const parsed = NewDocumentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "Invalid request" }, 400);
  }

  // The storage path is derived server-side and namespaced by the owner, so the
  // client never chooses where the file lives.
  const storagePath = `${auth.user.id}/${crypto.randomUUID()}`;

  const { data, error } = await auth.supabase
    .from("documents")
    .insert({
      user_id: auth.user.id,
      name: parsed.data.name,
      storage_path: storagePath,
    })
    .select("id")
    .single();

  if (error) {
    return json({ error: "Failed to create document" }, 500);
  }

  return json({ id: data.id }, 201);
}
