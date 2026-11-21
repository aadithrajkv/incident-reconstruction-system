import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const ALLOWED_ORIGINS = new Set([
  "https://preview.thotox.com",
  "https://thotox.com",
  "https://www.thotox.com",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (request.method !== "POST") return fail(405, "Use POST to delete your content.");
  const userId = ctx.userClaims?.id;
  if (!userId) return fail(401, "Sign in before deleting content.");
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1_024) return fail(413, "Request body is too large.");
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Send a content type and ID.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "Send a content type and ID.");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["contentType", "contentId"].includes(key))) return fail(422, "Invalid delete request.");
  const contentType = input.contentType;
  const contentId = input.contentId;
  if ((contentType !== "thought" && contentType !== "issue") || typeof contentId !== "string" || !UUID.test(contentId)) {
    return fail(422, "Choose your own thought or issue.");
  }

  if (contentType === "thought") {
    const { error } = await ctx.supabase.from("thoughts").delete().eq("id", contentId).eq("author_id", userId);
    if (error) return fail(409, "Your thought could not be deleted.");
    return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data: issue, error: readError } = await ctx.supabaseAdmin
    .from("grid_issues").select("id,image_path").eq("id", contentId).eq("author_id", userId).maybeSingle();
  if (readError) return fail(503, "Could not check issue ownership.");
  if (!issue) return fail(404, "Issue not found or not owned by this account.");
  if (issue.image_path) {
    const { error } = await ctx.supabaseAdmin.storage.from("grid-issue-images").remove([issue.image_path]);
    if (error) return fail(503, "Could not delete the issue photo. The issue is still available for retry.");
  }
  const { error: deleteError } = await ctx.supabaseAdmin
    .from("grid_issues").delete().eq("id", contentId).eq("author_id", userId);
  if (deleteError) return fail(503, "The issue could not be deleted.");
  return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
});

Deno.serve((request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  return handler(request).then(
    (response) => withCors(request, response),
    () => withCors(request, fail(500, "Content deletion failed.")),
  );
});
