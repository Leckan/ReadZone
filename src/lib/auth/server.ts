import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { PostgresDialect } from "kysely";
import { Pool } from "pg";
import { headers } from "next/headers";
import { getServerEnvironmentValue } from "@/lib/server/environment";

const allowedHosts = [
  "localhost:3000",
  "readflow.thinkzone.tech",
  "readzone.vercel.app",
];

function getAuthSettings() {
  return {
    databaseUrl: getServerEnvironmentValue("BETTER_AUTH_DATABASE_URL"),
    secret: getServerEnvironmentValue("BETTER_AUTH_SECRET"),
    googleClientId: getServerEnvironmentValue("GOOGLE_CLIENT_ID"),
    googleClientSecret: getServerEnvironmentValue("GOOGLE_CLIENT_SECRET"),
  };
}

function createBetterAuth(settings: ReturnType<typeof getAuthSettings>) {
  const pool = new Pool({
    connectionString: settings.databaseUrl,
    max: 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

  return betterAuth({
    appName: "ReadFlow",
    baseURL: {
      allowedHosts,
      protocol: process.env.NODE_ENV === "development" ? "http" : "https",
      fallback: "https://readflow.thinkzone.tech",
    },
    secret: settings.secret,
    database: {
      dialect: new PostgresDialect({ pool }),
      type: "postgres" as const,
      schemaName: "better_auth",
    },
    emailAndPassword: { enabled: true },
    socialProviders: settings.googleClientId && settings.googleClientSecret
      ? { google: { clientId: settings.googleClientId, clientSecret: settings.googleClientSecret } }
      : {},
    advanced: { database: { generateId: "uuid" } },
    plugins: [nextCookies()],
  });
}

type BetterAuthInstance = ReturnType<typeof createBetterAuth>;
let auth: BetterAuthInstance | undefined;

export function authIsConfigured() {
  const status = authConfigurationStatus();
  return status.databaseUrlConfigured && status.authSecretConfigured;
}

export function authConfigurationStatus() {
  const { databaseUrl, secret, googleClientId, googleClientSecret } = getAuthSettings();
  return {
    databaseUrlConfigured: Boolean(databaseUrl),
    authSecretConfigured: Boolean(secret && secret.length >= 32),
    googleClientIdConfigured: Boolean(googleClientId),
    googleClientSecretConfigured: Boolean(googleClientSecret),
  };
}

export function getBetterAuth(): BetterAuthInstance {
  if (auth) return auth;

  const settings = getAuthSettings();
  const { databaseUrl, secret } = settings;
  if (!databaseUrl || !secret || secret.length < 32) {
    throw new Error("Better Auth needs BETTER_AUTH_DATABASE_URL and a BETTER_AUTH_SECRET with at least 32 characters.");
  }
  const instance = createBetterAuth(settings);
  auth = instance;
  return instance;
}

export async function getCurrentUser() {
  if (!authIsConfigured()) return null;
  const session = await getBetterAuth().api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
