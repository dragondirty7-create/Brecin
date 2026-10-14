"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The Project Presser icon, revealed: charge fills the hand-drawn bolt, strikes,
 * and settles on the exact home-screen icon. Shows the still icon first, and
 * keeps it if motion is reduced or the reveal script can't load.
 */
const SIZE = 132;

type Reveal = { frame(t: number): void; play(done?: () => void): void };
type RevealGlobal = { PresserReveal?: { create(c: HTMLCanvasElement, o: { layout: "tile" }): Reveal } };

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Couldn't load ${src}`));
    document.head.appendChild(s);
  });
}

export default function LogoReveal() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    (async () => {
      try {
        await loadScript("/brand/presser-geo.js");
        await loadScript("/brand/presser-reveal.js");
        const api = (window as unknown as RevealGlobal).PresserReveal;
        if (cancelled || !canvas.current || !api) return;
        const reveal = api.create(canvas.current, { layout: "tile" });
        reveal.frame(0);
        setLive(true);
        reveal.play();
      } catch {
        /* keep the still icon */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="brand-reveal" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={SIZE} height={SIZE} hidden={live} />
      <canvas ref={canvas} width={SIZE * 2} height={SIZE * 2} hidden={!live} />
    </div>
  );
}
