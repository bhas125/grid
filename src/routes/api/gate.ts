import { createFileRoute } from "@tanstack/react-router";

const PASS = "blake123";
const COOKIE = "grid_gate";
const MAX_AGE = 60 * 60 * 24 * 30;

function hasGate(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return new RegExp(`(?:^|;\\s*)${COOKIE}=1(?:;|$)`).test(cookie);
}

function cookieHeader(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

export const Route = createFileRoute("/api/gate")({
  server: {
    handlers: {
      GET: ({ request }) => Response.json({ ok: hasGate(request) }),
      POST: async ({ request }) => {
        let password = "";
        try {
          const body = (await request.json()) as { password?: string };
          password = typeof body.password === "string" ? body.password : "";
        } catch {
          password = "";
        }
        if (password !== PASS) {
          return Response.json({ ok: false }, { status: 401 });
        }
        return Response.json(
          { ok: true },
          { headers: { "Set-Cookie": cookieHeader(request) } },
        );
      },
    },
  },
});
