import { toNextJsHandler } from "better-auth/next-js";
import { getBetterAuth, authIsConfigured, authConfigurationStatus } from "@/lib/auth/server";

function safeErrorDetails(error: unknown) {
  if (!(error instanceof Error)) return { errorName: "UnknownError" };
  return {
    errorName: error.name,
    errorMessage: error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[database URL redacted]"),
  };
}

async function handle(request: Request) {
  if (!authIsConfigured()) {
    const configuration = authConfigurationStatus();
    console.error("[ReadFlow auth] Required server configuration is missing.", configuration);
    return Response.json(
      { message: "Better Auth is not configured on this deployment.", code: "AUTH_NOT_CONFIGURED" },
      { status: 503 },
    );
  }
  try {
    const handlers = toNextJsHandler(getBetterAuth());
    const response = await (request.method === "GET" ? handlers.GET(request) : handlers.POST(request));
    if (response.status >= 500) {
      console.error("[ReadFlow auth] Auth handler returned a server error.", {
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
        ...authConfigurationStatus(),
      });
    }
    return response;
  } catch (error) {
    console.error("[ReadFlow auth] Auth handler threw an error.", {
      method: request.method,
      path: new URL(request.url).pathname,
      ...authConfigurationStatus(),
      ...safeErrorDetails(error),
    });
    return Response.json(
      { message: "Authentication is temporarily unavailable.", code: "AUTH_UNAVAILABLE" },
      { status: 503 },
    );
  }
}

export const GET = handle;
export const POST = handle;
