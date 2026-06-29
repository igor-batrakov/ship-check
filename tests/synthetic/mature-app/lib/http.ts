// Helpers that lock API responses to the app's own origin (CORS) and return JSON
// consistently. Every route uses these so cross-origin sites cannot read API
// responses from a victim's browser.

function allowedOrigin(): string {
  return process.env.APP_ORIGIN ?? "https://app.example.com";
}

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
    Vary: "Origin",
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
