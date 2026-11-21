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
  if (request.method !== "POST") return fail(405, "Use POST to moderate content.");
  const moderatorId = ctx.userClaims?.id;
  if (!moderatorId) return fail(401, "Sign in before moderating content.");

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1_024) return fail(413, "Request body is too large.");
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Send a moderation action and content ID.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(400, "Send a moderation action and content ID.");
  }

  const input = body as Record<string, unknown>;
  const targetType = input.targetType;
  const targetId = input.targetId;
  const action = input.action;
  if (
    Object.keys(input).some((key) => !["targetType", "targetId", "action"].includes(key)) ||
    (targetType !== "thought" && targetType !== "issue") ||
    typeof targetId !== "string" || !UUID.test(targetId) ||
    (action !== "publish" && action !== "hide")
  ) return fail(422, "Choose an issue or thought and a publish or hide action.");

  const { data: isModerator, error: roleError } = await ctx.supabase.rpc("moderator_access_status");
  if (roleError) return fail(503, "Could not verify moderator access.");
  if (isModerator !== true) return fail(403, "Moderator permission required.");

  const { data, error } = await ctx.supabaseAdmin.rpc("moderate_content_server_only", {
    p_moderator_id: moderatorId,
    p_target_type: targetType,
    p_target_id: targetId,
    p_action: action,
  });
  if (error) return fail(409, "That moderation action could not be applied.");
  return Response.json({ status: data }, { headers: { "Cache-Control": "no-store" } });
});

Deno.serve((request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  return handler(request).then(
    (response) => withCors(request, response),
    () => withCors(request, fail(500, "Moderation action failed.")),
  );
});
