// PLANTED VULN (websec/deploy-config): a debug endpoint exposed in production that returns the
// environment variables and stack. It should be disabled in production.
export async function GET() {
  return Response.json({
    env: process.env,
    node_env: process.env.NODE_ENV,
    cwd: process.cwd(),
  });
}
