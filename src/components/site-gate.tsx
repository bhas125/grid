import { useEffect, useState } from "react";

const STORAGE = "grid-gate";

export function SiteGate({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const cached = (() => {
      try {
        return localStorage.getItem(STORAGE) === "1";
      } catch {
        return false;
      }
    })();
    if (cached) {
      setOpen(true);
      setChecking(false);
      return;
    }
    fetch("/api/gate")
      .then((r) => r.json())
      .then((d: { ok?: boolean }) => {
        if (!live) return;
        if (d.ok) {
          try {
            localStorage.setItem(STORAGE, "1");
          } catch {
            /* ignore */
          }
          setOpen(true);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setChecking(false);
      });
    return () => {
      live = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError(true);
        setBusy(false);
        return;
      }
      try {
        localStorage.setItem(STORAGE, "1");
      } catch {
        /* ignore */
      }
      setOpen(true);
    } catch {
      setError(true);
    }
    setBusy(false);
  }

  if (open) return <>{children}</>;

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
      <form onSubmit={submit} className="w-full max-w-xs space-y-6">
        <div>
          <div className="flex h-11 items-center gap-3">
            <span className="grid grid-cols-2 gap-px" aria-hidden="true">
              <span className="size-1.5 bg-grid shadow-glow" />
              <span className="size-1.5 bg-grid/40" />
              <span className="size-1.5 bg-grid/40" />
              <span className="size-1.5 bg-grid shadow-glow" />
            </span>
            <h1 className="font-display text-3xl leading-none font-semibold tracking-[0.18em]">GRID</h1>
          </div>
          <p className="mt-2 font-mono text-xs tracking-widest text-faint uppercase">Tennessee · Restricted</p>
        </div>
        {checking ? (
          <div className="h-10 w-full animate-pulse bg-elevated/80" />
        ) : (
          <>
            <label className="block">
              <span className="font-mono text-[10px] tracking-widest text-faint uppercase">Password</span>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(false);
                }}
                className="mt-1 h-10 w-full border border-line bg-surface px-3 font-mono text-sm text-fg outline-none focus:border-grid"
              />
            </label>
            {error ? (
              <p className="font-mono text-[10px] tracking-widest text-hot uppercase">Wrong password</p>
            ) : null}
            <button
              type="submit"
              disabled={busy || !password}
              className="h-10 w-full border border-grid bg-grid/15 font-mono text-xs tracking-widest text-grid uppercase hover:bg-grid/25 disabled:opacity-40"
            >
              {busy ? "Checking" : "Enter"}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
