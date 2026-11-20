import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { designTokens } from "@steve/shared";
import "./globals.css";

const alanSans = localFont({
  src: "../fonts/AlanSans-Variable.woff2",
  display: "swap",
  weight: "100 900",
  variable: "--font-alan-sans",
});

export const metadata: Metadata = {
  title: "Steve",
};

function themeCss(): string {
  const color = designTokens.color;
  const weight = designTokens.font.weight;
  return [
    `--color-primary:${color.primary}`,
    `--color-indigo-50:${color.indigo50}`,
    `--color-indigo-700:${color.indigo700}`,
    `--color-indigo-900:${color.indigo900}`,
    `--color-heading:${color.heading}`,
    `--color-foreground:${color.foreground}`,
    `--color-canvas:${color.canvas}`,
    `--color-surface:${color.surface}`,
    `--color-border:${color.border}`,
    `--radius-default:${designTokens.radius.default}`,
    `--shadow-faint:${designTokens.shadow.faint}`,
    `--font-fallback:${designTokens.font.fallback.join(", ")}`,
    `--font-weight-body:${weight.body}`,
    `--font-weight-heading:${weight.heading}`,
    `--font-weight-button:${weight.button}`,
  ].join(";");
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={alanSans.variable}>
      <body>
        <style>{`:root{${themeCss()}}`}</style>
        {children}
      </body>
    </html>
  );
}
