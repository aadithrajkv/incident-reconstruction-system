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

async function digestToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

type RecoveryContext = {
  supabaseAdmin: {
    rpc(name: string, parameters: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
};

async function storeToken(ctx: RecoveryContext, userId: string) {
  const token = newToken();
  const { error } = await ctx.supabaseAdmin.rpc("store_pilot_recovery_token_server_only", {
    p_user_id: userId,
    p_token_digest: await digestToken(token),
  });
  return { token: error ? null : token, error };
}

const handler = withSupabase({ auth: "user" }, async (request, ctx) => {
  if (request.method !== "POST") return fail(405, "Use POST to manage a restore key.");
  const userId = ctx.userClaims?.id;
  if (!userId) return fail(401, "Start an anonymous session first.");

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1_024) return fail(413, "Request body is too large.");
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Send a restore-key action.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "Send a restore-key action.");
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["action", "token"].includes(key))) return fail(422, "Invalid restore-key request.");

  const { data: authResult, error: authError } = await ctx.supabaseAdmin.auth.admin.getUserById(userId);
  if (authError || !authResult.user || authResult.user.is_anonymous !== true) {
    return fail(403, "Restore keys are available only to anonymous pilot sessions.");
  }

  if (input.action === "rotate") {
    const { data: member, error } = await ctx.supabase.rpc("pilot_access_status");
    if (error) return fail(503, "Could not verify pilot access.");
    if (member !== true) return fail(403, "Join the invited pilot before creating a restore key.");
    const result = await storeToken(ctx, userId);
    if (result.error || !result.token) return fail(503, "A restore key could not be created.");
    return Response.json({ recoveryToken: result.token }, { headers: { "Cache-Control": "no-store" } });
  }

  if (input.action !== "restore" || typeof input.token !== "string" || !/^[0-9a-f]{64}$/i.test(input.token)) {
    return fail(422, "Enter the 64-character restore key.");
  }
  const { data: oldUserId, error: restoreError } = await ctx.supabaseAdmin.rpc("restore_pilot_data_server_only", {
    p_new_user_id: userId,
    p_token_digest: await digestToken(input.token.toUpperCase()),
  });
  if (restoreError) {
    const rateLimited = restoreError.code === "53300";
    return fail(rateLimited ? 429 : 403, rateLimited ? "Too many attempts. Try again in an hour." : "That restore key is invalid, expired, or already used.");
  }

  const { error: oldUserDeleteError } = await ctx.supabaseAdmin.auth.admin.deleteUser(oldUserId);
  const recovery = await storeToken(ctx, userId);
  return Response.json({
    restored: true,
    recoveryToken: recovery.token,
    oldSessionCleanupPending: !!oldUserDeleteError,
  }, { headers: { "Cache-Control": "no-store" } });
});

Deno.serve((request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  return handler(request).then(
    (response) => withCors(request, response),
    () => withCors(request, fail(500, "Restore-key operation failed.")),
  );
});
