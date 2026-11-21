import type { Viewport } from "next";
import type { ReactNode } from "react";
import { designTokens } from "@steve/shared";

export const viewport: Viewport = {
  themeColor: designTokens.color.indigo50,
};

export default function ChatLayout({ children }: { children: ReactNode }) {
  return children;
}
