import { createFileRoute } from "@tanstack/react-router";

const PASS = "blake123";
const COOKIE = "grid_gate";

function expireCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export const Route = createFileRoute("/api/gate")({
  server: {
    handlers: {
      GET: ({ request }) =>
        Response.json({ ok: false }, { headers: { "Set-Cookie": expireCookie(request) } }),
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
        return Response.json({ ok: true }, { headers: { "Set-Cookie": expireCookie(request) } });
      },
    },
  },
});
