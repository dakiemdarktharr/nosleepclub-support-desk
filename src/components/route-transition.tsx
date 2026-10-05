"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Animate arrival only: never delay navigation, clone pages, or reset form state. */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches || !surface.current?.animate) return;
    const animation = surface.current.animate(
      [{ opacity: 0.4, transform: "translateY(7px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 220, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    const stop = () => animation.cancel();
    preference.addEventListener("change", stop);
    return () => { stop(); preference.removeEventListener("change", stop); };
  }, [pathname]);

  return <div ref={surface} className="route-surface">{children}</div>;
}
