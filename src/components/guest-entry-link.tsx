"use client";
import type { ComponentProps } from "react";
import { TransitionLink } from "./route-transition";

export function GuestEntryLink(props: Omit<ComponentProps<typeof TransitionLink>, "href" | "transition" | "onClick">) {
  // Consume the entry marker in the destination tab, including modified clicks.
  return <TransitionLink {...props} href="/guest?newSession=1" transition="line" />;
}
