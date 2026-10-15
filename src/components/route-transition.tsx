"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type TransitionKind = "wipe" | "line";
type NavigationMotion = { kind: TransitionKind; from: string; startedAt: number };
const NavigationContext = createContext<{ begin: (kind: TransitionKind) => void; active: boolean }>({ begin: () => {}, active: false });

export function useNavigationInFlight() {
  return useContext(NavigationContext).active;
}

/** Real links retain prefetch, keyboard, modified-click and browser-back behavior. */
export function TransitionLink({ transition, onClick, ...props }: ComponentProps<typeof Link> & { transition: TransitionKind }) {
  const { begin } = useContext(NavigationContext);
  return <Link {...props} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === "_blank" || props.download) return;
    const destination = new URL(event.currentTarget.href);
    if (destination.origin === window.location.origin && destination.pathname !== window.location.pathname) begin(transition);
  }} />;
}

/** Cosmetic only: navigation starts immediately; no clones, form resets or network delays. */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const surface = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState<NavigationMotion | null>(null);
  const [revealing, setRevealing] = useState(false);

  function begin(kind: TransitionKind) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setRevealing(false);
    setMotion({ kind, from: pathname, startedAt: performance.now() });
  }

  useEffect(() => {
    if (!motion) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => { setMotion(null); setRevealing(false); };
    preference.addEventListener("change", stop);
    // A failed/cancelled navigation can never leave a curtain covering the app.
    const watchdog = window.setTimeout(stop, 2500);
    const arrived = pathname !== motion.from;
    const coverRemaining = Math.max(0, 180 - (performance.now() - motion.startedAt));
    const reveal = arrived ? window.setTimeout(() => setRevealing(true), coverRemaining) : undefined;
    const finish = arrived ? window.setTimeout(stop, coverRemaining + 560) : undefined;
    return () => {
      preference.removeEventListener("change", stop);
      window.clearTimeout(watchdog);
      window.clearTimeout(reveal);
      window.clearTimeout(finish);
    };
  }, [motion, pathname]);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches || !surface.current?.animate) return;
    const animation = surface.current.animate(
      [{ opacity: 0.7, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    const stop = () => animation.cancel();
    preference.addEventListener("change", stop);
    return () => { stop(); preference.removeEventListener("change", stop); };
  }, [pathname]);

  return <NavigationContext.Provider value={{ begin, active: motion !== null }}>
    <div ref={surface} className="route-surface">{children}</div>
    {motion && <div key={motion.startedAt} className={`route-curtain route-curtain-${motion.kind}${revealing ? " is-revealing" : ""}`} data-transition={motion.kind} aria-hidden="true">
      <span className="curtain-panel curtain-left" />
      <span className="curtain-panel curtain-right" />
      {motion.kind === "line" && <span className="curtain-line" />}
    </div>}
  </NavigationContext.Provider>;
}
