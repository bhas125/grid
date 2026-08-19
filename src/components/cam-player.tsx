import { useEffect, useRef, useState } from "react";

export function CamPlayer({
  stream,
  snap,
  title,
}: {
  stream?: string;
  snap?: string;
  title: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"video" | "snap">(stream ? "video" : "snap");
  const [snapSrc, setSnapSrc] = useState(snap ?? "");

  useEffect(() => {
    if (!snap) return;
    setSnapSrc(snap);
    if (mode !== "snap") return;
    const tick = () => setSnapSrc(`${snap}${snap.includes("?") ? "&" : "?"}t=${Date.now()}`);
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [snap, mode]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !stream || mode !== "video") return;
    let hls: { destroy: () => void } | null = null;
    let dead = false;
    const play = () => {
      void el.play().catch(() => undefined);
    };
    const fail = () => {
      if (!dead) setMode("snap");
    };

    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = stream;
      el.addEventListener("loadedmetadata", play);
      el.addEventListener("error", fail);
      return () => {
        dead = true;
        el.removeEventListener("loadedmetadata", play);
        el.removeEventListener("error", fail);
        el.pause();
        el.removeAttribute("src");
        el.load();
      };
    }

    void import("hls.js")
      .then(({ default: Hls }) => {
        if (dead) return;
        if (!Hls.isSupported()) {
          fail();
          return;
        }
        const inst = new Hls({
          enableWorker: true,
          maxBufferLength: 8,
          capLevelToPlayerSize: true,
        });
        hls = inst;
        inst.loadSource(stream);
        inst.attachMedia(el);
        inst.on(Hls.Events.MANIFEST_PARSED, play);
        inst.on(Hls.Events.ERROR, (_e, data) => {
          if (data?.fatal) fail();
        });
      })
      .catch(fail);

    return () => {
      dead = true;
      hls?.destroy();
      el.pause();
      el.removeAttribute("src");
      el.load();
    };
  }, [stream, mode]);

  if (mode === "snap" && snapSrc) {
    return (
      <img
        src={snapSrc}
        alt={title}
        className="mt-2 aspect-[4/3] w-full border border-line object-cover bg-bg"
      />
    );
  }

  return (
    <video
      ref={ref}
      muted
      playsInline
      autoPlay
      controls
      poster={snap || undefined}
      title={title}
      className="mt-2 aspect-[4/3] w-full border border-line bg-bg object-cover"
    />
  );
}
