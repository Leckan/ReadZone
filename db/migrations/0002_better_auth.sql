-- Better Auth identity, session, and provider tables.
-- Run with a migration/owner connection. Runtime access belongs to a separate
-- role with DML permissions on this schema and must not own it.
CREATE SCHEMA IF NOT EXISTS better_auth;

CREATE TABLE IF NOT EXISTS better_auth."user" (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS better_auth.session (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid NOT NULL REFERENCES better_auth."user" (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS session_userid_idx
  ON better_auth.session ("userId");

CREATE TABLE IF NOT EXISTS better_auth.account (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" uuid NOT NULL REFERENCES better_auth."user" (id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS account_userid_idx
  ON better_auth.account ("userId");

CREATE TABLE IF NOT EXISTS better_auth.verification (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS verification_identifier_idx
  ON better_auth.verification (identifier);
