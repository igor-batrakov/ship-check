import { getUser } from "@/lib/auth";
import { serviceClient } from "@/lib/supabase";
import { json, preflight } from "@/lib/http";

export const runtime = "nodejs";

export function OPTIONS(): Response {
  return preflight();
}

// Return a short-lived signed URL for a document's file. The private bucket has
// no public policy, so the service-role client mints the link server-side.
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const auth = await getUser(req);
  if (!auth) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = serviceClient();

  const { data: doc, error } = await admin
    .from("documents")
    .select("id, name, storage_path")
    .eq("id", params.id)
    .single();

  if (error || !doc) {
    return json({ error: "Not found" }, 404);
  }

  const { data: signed, error: signError } = await admin.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 60);

  if (signError || !signed) {
    return json({ error: "Failed to create link" }, 500);
  }

  return json({ name: doc.name, url: signed.signedUrl }, 200);
}
