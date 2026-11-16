import { getNeonAuth, authIsConfigured } from "@/lib/auth/server";

type AuthRouteContext = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: AuthRouteContext) {
  if (!authIsConfigured()) {
    return Response.json({ error: "Neon Auth is not configured on this deployment." }, { status: 503 });
  }
  try {
    const handlers = getNeonAuth().handler();
    const method = request.method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    return handlers[method](request, context);
  } catch {
    return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
