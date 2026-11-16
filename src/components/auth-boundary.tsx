"use client";

import { createContext, useContext, type ReactNode } from "react";
import { authClient, authEnabled } from "@/lib/auth/client";

export type AppAuthUser = { id: string; name: string; email: string };
type AuthState = {
  enabled: boolean;
  loading: boolean;
  user: AppAuthUser | null;
  signOut: () => Promise<void>;
};

const localAuth: AuthState = { enabled: false, loading: false, user: null, signOut: async () => {} };
const AuthContext = createContext<AuthState>(localAuth);

function ConnectedAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const user = data?.user
    ? { id: data.user.id, name: data.user.name ?? "Reader", email: data.user.email ?? "" }
    : null;
  const value: AuthState = {
    enabled: true,
    loading: isPending,
    user,
    signOut: async () => { await authClient.signOut(); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthBoundary({ children }: { children: ReactNode }) {
  if (!authEnabled) return <AuthContext.Provider value={localAuth}>{children}</AuthContext.Provider>;
  return <ConnectedAuth>{children}</ConnectedAuth>;
}

export function useAppAuth() {
  return useContext(AuthContext);
}
