"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
export const authEnabled = process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED === "true";
export const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";
