import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <div className="flex h-11 items-center gap-3">
            <span className="grid grid-cols-2 gap-px" aria-hidden="true">
              <span className="size-1.5 bg-grid shadow-glow" />
              <span className="size-1.5 bg-grid/40" />
              <span className="size-1.5 bg-grid/40" />
              <span className="size-1.5 bg-grid shadow-glow" />
            </span>
            <h1 className="font-display text-3xl leading-none font-semibold tracking-[0.18em]">
              GRID
            </h1>
          </div>
          <p className="mt-2 font-mono text-xs tracking-widest text-faint uppercase">
            Sign in to save a session
          </p>
        </div>
        {authEnabled ? (
          <div className="space-y-2">
            {GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                className="h-11 w-full border border-line bg-surface px-4 font-mono text-xs tracking-widest text-fg uppercase hover:border-grid hover:text-grid"
              >
                Continue with {p.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        )}
        <Link
          to="/"
          className="inline-block font-mono text-xs tracking-widest text-faint uppercase hover:text-grid"
        >
          Back to map
        </Link>
      </div>
    </main>
  );
}
