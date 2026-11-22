import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const ALLOWED_ORIGINS = new Set([
  "https://preview.thotox.com",
  "https://thotox.com",
  "https://www.thotox.com",
  "http://localhost:8765",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://127.0.0.1:8765",
]);

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of corsHeaders(request)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
}

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

const handler = withSupabase({ auth: "user" }, async (request, ctx) => {
  if (request.method !== "POST") return fail(405, "Use POST to delete the account.");
  const userId = ctx.userClaims?.id;
  if (!userId) return fail(401, "Sign in before deleting the account.");
  const raw = await request.text();
  if (raw && raw !== "{}") return fail(400, "Account deletion does not accept a request body.");

  const paths: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await ctx.supabaseAdmin
      .from("grid_issues")
      .select("image_path")
      .eq("author_id", userId)
      .not("image_path", "is", null)
      .range(offset, offset + 499);
    if (error) return fail(503, "Could not prepare the account’s private images for deletion.");
    for (const row of data ?? []) if (typeof row.image_path === "string") paths.push(row.image_path);
    if (!data || data.length < 500) break;
  }

  for (let offset = 0; offset < paths.length; offset += 100) {
    const { error } = await ctx.supabaseAdmin.storage
      .from("grid-issue-images")
      .remove(paths.slice(offset, offset + 100));
    if (error) return fail(503, "Could not delete private issue images. Retry before signing out.");
  }

  const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return fail(503, "The account could not be deleted. Please retry or contact support.");
  return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
});

Deno.serve((request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  return handler(request).then(
    (response) => withCors(request, response),
    () => withCors(request, fail(500, "Account deletion failed.")),
  );
});
