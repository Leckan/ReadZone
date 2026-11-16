import { toNextJsHandler } from "better-auth/next-js";
import { getBetterAuth, authIsConfigured } from "@/lib/auth/server";

async function handle(request: Request) {
  if (!authIsConfigured()) {
    return Response.json({ error: "Better Auth is not configured on this deployment." }, { status: 503 });
  }
  try {
    const handlers = toNextJsHandler(getBetterAuth());
    return request.method === "GET" ? handlers.GET(request) : handlers.POST(request);
  } catch {
    return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
