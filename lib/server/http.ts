/**
 * Small helpers shared by the route handlers: JSON responses, safe request
 * parsing and the cross-site request check.
 */
import { NextResponse } from "next/server";

export const ok = (data: unknown = { ok: true }, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error: message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

const MAX_JSON_BYTES = 20 * 1024;

/**
 * Cross-site request forgery check for requests that change something.
 * A browser always sends the Origin header on such requests; it must be this
 * site. (The session cookie is also SameSite=Strict; this is a second layer.)
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Parse a small JSON body; returns null when it is missing, too large or not JSON. */
export async function readJson(request: Request): Promise<unknown | null> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  try {
    const text = await request.text();
    if (text.length > MAX_JSON_BYTES) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The site's own address, used to build links sent by email. */
export function siteOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}
