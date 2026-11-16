import { createNeonAuth } from "@neondatabase/auth/next/server";
import { getServerEnvironmentValue } from "@/lib/server/environment";

let neonAuth: ReturnType<typeof createNeonAuth> | undefined;

export function authIsConfigured() {
  const secret = getServerEnvironmentValue("NEON_AUTH_COOKIE_SECRET");
  return Boolean(getServerEnvironmentValue("NEON_AUTH_BASE_URL") && secret && secret.length >= 32);
}

export function getNeonAuth() {
  const baseUrl = getServerEnvironmentValue("NEON_AUTH_BASE_URL");
  const secret = getServerEnvironmentValue("NEON_AUTH_COOKIE_SECRET");
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
