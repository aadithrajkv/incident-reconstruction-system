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

function errorResponse(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function digestInvite(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code.trim().toUpperCase());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digestRecoveryToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newRecoveryToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const handler = withSupabase({ auth: "user" }, async (request, ctx) => {
  if (request.method !== "POST") return errorResponse(405, "Use POST to redeem an invite.");
  const userId = ctx.userClaims?.id;
  if (!userId) return errorResponse(401, "Sign in before redeeming an invite.");

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1_024) return errorResponse(413, "Request body is too large.");
    body = JSON.parse(raw);
  } catch {
    return errorResponse(400, "Enter a valid invite code.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(400, "Enter a valid invite code.");
  }

  const code = (body as Record<string, unknown>).code;
  if (typeof code !== "string" || !/^[a-z0-9-]{12,40}$/i.test(code.trim())) {
    return errorResponse(422, "Check the invite code and try again.");
  }

  const { data: userResult, error: userError } = await ctx.supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userResult.user) return errorResponse(401, "This session could not be verified.");
  if (userResult.user.is_anonymous !== true) {
    return errorResponse(403, "Pilot invites can only be redeemed by an anonymous pilot session.");
  }

  const { data: alreadyEnrolled, error: statusError } = await ctx.supabase.rpc("pilot_access_status");
  if (statusError) return errorResponse(503, "Could not check pilot access. Try again shortly.");
  if (alreadyEnrolled !== true) {
    const codeDigest = await digestInvite(code);
    const { data, error } = await ctx.supabaseAdmin.rpc("redeem_pilot_invite_server_only", {
      p_user_id: userId,
      p_code_digest: codeDigest,
    });

    if (error) return errorResponse(503, "Could not redeem the invite. Try again shortly.");
    if (data === "rate_limited") return errorResponse(429, "Too many attempts. Try again in an hour.");
    if (data !== "enrolled" && data !== "already_enrolled") {
      return errorResponse(403, "That invite code is invalid, expired, or already used.");
    }
  }

  const recoveryToken = newRecoveryToken();
  const tokenDigest = await digestRecoveryToken(recoveryToken);
  const { error: tokenError } = await ctx.supabaseAdmin.rpc("store_pilot_recovery_token_server_only", {
    p_user_id: userId,
    p_token_digest: tokenDigest,
  });
  if (tokenError) return errorResponse(503, "Access is active, but a restore key could not be created. Retry with the same invite.");
  return Response.json({ enrolled: true, recoveryToken }, { headers: { "Cache-Control": "no-store" } });
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  try {
    return withCors(request, await handler(request));
  } catch {
    return withCors(request, errorResponse(500, "Invite redemption failed. Try again shortly."));
  }
});
