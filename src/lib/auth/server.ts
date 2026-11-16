import { createNeonAuth } from "@neondatabase/auth/next/server";

let neonAuth: ReturnType<typeof createNeonAuth> | undefined;

export function authIsConfigured() {
  return Boolean(process.env.NEON_AUTH_BASE_URL && process.env.NEON_AUTH_COOKIE_SECRET?.length && process.env.NEON_AUTH_COOKIE_SECRET.length >= 32);
}

export function getNeonAuth() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret || secret.length < 32) {
    throw new Error("Neon Auth is not configured. Set NEON_AUTH_BASE_URL and a 32-character NEON_AUTH_COOKIE_SECRET.");
  }
  if (!neonAuth) neonAuth = createNeonAuth({ baseUrl, cookies: { secret } });
  return neonAuth;
}

export async function getCurrentUser() {
  if (!authIsConfigured()) return null;
  const result = await getNeonAuth().getSession();
  return result.data?.user ?? null;
}
