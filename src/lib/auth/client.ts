"use client";

import { createAuthClient } from "@neondatabase/auth/next";

export const authClient = createAuthClient();
export const authEnabled = process.env.NEXT_PUBLIC_NEON_AUTH_ENABLED === "true";
