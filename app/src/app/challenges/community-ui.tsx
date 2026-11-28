import type { ReactNode } from "react";
import "./community-ui.css";

export function Eyebrow(props: { readonly tone?: "indigo" | "orange" | "teal"; readonly children: ReactNode }) {
  return <span className={`community-eyebrow community-eyebrow-${props.tone ?? "indigo"}`}>{props.children}</span>;
}

export function WatchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="3" />
      <path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3" />
    </svg>
  );
}
