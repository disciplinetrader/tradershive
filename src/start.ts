import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { errorGuardMiddleware } from "./lib/server-errors";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
};

function withSecurityHeaders(response: Response): Response {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(k)) response.headers.set(k, v);
  }
  return response;
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    const res = await next();
    return res instanceof Response ? withSecurityHeaders(res) : res;
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return withSecurityHeaders(
      new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, errorGuardMiddleware],
  requestMiddleware: [errorMiddleware],
}));
