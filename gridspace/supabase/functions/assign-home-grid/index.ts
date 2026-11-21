import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const MAX_ACCURACY_METERS = 1_000;
const MAX_LATITUDE = 90;
const R0 = 6_378_137;
const SQRT3 = Math.sqrt(3);
const RM = (1_000 / Math.cos((20 * Math.PI) / 180)) / SQRT3;
const ALLOWED_ORIGINS = new Set([
  "https://preview.thotox.com",
  "https://thotox.com",
  "https://www.thotox.com",
  "http://localhost:8765",
  "http://127.0.0.1:8765",
]);

type AssignmentRequest = {
  lat: number;
  lng: number;
  accuracy: number;
};

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of corsHeaders(request)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function gridIdFor(lat: number, lng: number): string {
  // Keep this in sync with merc() and hexOf() in app.js.
  const x = R0 * (lng * Math.PI) / 180;
  const y = R0 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const q = ((SQRT3 / 3) * x - y / 3) / RM;
  const r = ((2 / 3) * y) / RM;
  const s = -q - r;
  let a = Math.round(q);
  let b = Math.round(r);
  const c = Math.round(s);
  const da = Math.abs(a - q);
  const db = Math.abs(b - r);
  const dc = Math.abs(c - s);

  if (da > db && da > dc) a = -b - c;
  else if (db > dc) b = -a - c;
  return `${a},${b}`;
}

function parseBody(value: unknown): AssignmentRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["lat", "lng", "accuracy"].includes(key))) return null;

  const { lat, lng, accuracy } = body;
  if (
    typeof lat !== "number" || !Number.isFinite(lat) || lat <= -MAX_LATITUDE || lat >= MAX_LATITUDE ||
    typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180 ||
    typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0 ||
    accuracy > MAX_ACCURACY_METERS
  ) return null;

  return { lat, lng, accuracy };
}

const handleRequest = withSupabase({ auth: "user" }, async (request, ctx) => {
  if (request.method !== "POST") return jsonError(405, "Use POST to assign a home grid.");
  if (!ctx.userClaims?.id) return jsonError(401, "Sign in before assigning a home grid.");

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError(400, "Send valid JSON with lat, lng, and accuracy.");
  }
  if (rawBody.length > 2_048) return jsonError(413, "Request body is too large.");

  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    return jsonError(400, "Send valid JSON with lat, lng, and accuracy.");
  }

  const location = parseBody(value);
  if (!location) {
    return jsonError(422, `Location must be valid and accurate to within ${MAX_ACCURACY_METERS} m.`);
  }

  const gridId = gridIdFor(location.lat, location.lng);
  const { data, error } = await ctx.supabaseAdmin.rpc("assign_home_grid_server_only", {
    p_user_id: ctx.userClaims.id,
    p_grid_id: gridId,
  });

  if (error) return jsonError(503, "Could not save the home grid. Try again shortly.");
  if (data === "rate_limited") return jsonError(429, "Home grid can be refreshed up to 12 times per hour.");
  if (data !== "assigned") return jsonError(404, "The signed-in profile is not ready yet.");

  // Coordinates are used only for this request; the database stores only gridId.
  return Response.json({ gridId, accuracyAccepted: true }, {
    headers: { "Cache-Control": "no-store" },
  });
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  try {
    return withCors(request, await handleRequest(request));
  } catch {
    return withCors(request, jsonError(500, "Home grid assignment failed. Try again shortly."));
  }
});
