"use client";
import { useEffect, useRef, useState } from "react";
import { LAUNCH_KEY } from "../lib/launch";

/**
 * Launch screen: the Project Presser logo reveal plays once when the app opens,
 * then fades into the app. Tap or press any key to skip. Skipped for the rest
 * of the visit, and never shown with reduced motion (see the inline script in
 * app/layout.tsx and the CSS in globals.css, which hide it before first paint).
 */
const HOLD_AFTER_STRIKE = 1.2;   // seconds of name + settled logo before fading
const FADE_MS = 450;
const NEVER_LONGER_THAN_MS = 6000;

type Reveal = { frame(t: number): void; duration: number; strikeAt: number };
type RevealGlobal = {
  PresserReveal?: { create(c: HTMLCanvasElement, o: { layout: "stage"; plain: boolean }): Reveal };
};

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

export default function LaunchSplash() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const finishRef = useRef<() => void>(() => {});
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (document.documentElement.dataset.splash === "skip" || reduced) {
      setGone(true);
      return;
    }
    try { sessionStorage.setItem(LAUNCH_KEY, "1"); } catch { /* private mode: plays again next load */ }

    let raf = 0;
    let done = false;
    let fadeTimer = 0;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      setLeaving(true);
      fadeTimer = window.setTimeout(() => setGone(true), FADE_MS);
    };
    finishRef.current = finish;
    const bail = window.setTimeout(finish, NEVER_LONGER_THAN_MS);   // never hold the app hostage
    const onKey = () => finish();
    window.addEventListener("keydown", onKey);

    (async () => {
      try {
        await loadScript("/brand/presser-geo.js");
        await loadScript("/brand/presser-reveal.js");
        await document.fonts?.load("800 64px 'Big Shoulders Display'").catch(() => undefined);
        const api = (window as unknown as RevealGlobal).PresserReveal;
        const el = canvas.current;
        if (done || !api || !el) return finish();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        el.width = el.height = Math.round(el.getBoundingClientRect().width * dpr);
        const reveal = api.create(el, { layout: "stage", plain: true });
        const end = reveal.strikeAt + HOLD_AFTER_STRIKE;
        const t0 = performance.now();
        const tick = (now: number) => {
          const t = (now - t0) / 1000;
          reveal.frame(Math.min(t, reveal.duration));
          if (t >= end) finish();
          else raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        finish();
      }
    })();

    return () => {
      done = true;
      cancelAnimationFrame(raf);
      clearTimeout(bail);
      clearTimeout(fadeTimer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (gone) return null;
  return (
    <div className={`launch${leaving ? " leaving" : ""}`} aria-hidden="true" onPointerDown={() => finishRef.current()}>
      <canvas ref={canvas} />
    </div>
  );
}
