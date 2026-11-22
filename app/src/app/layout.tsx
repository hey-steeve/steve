import type { Metadata, Viewport } from "next";
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
  icons: {
    icon: [
      { url: "/icons/favicon-page.ico" },
      { url: "/icons/favicon-16-page.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32-page.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon-page.png", sizes: "180x180" }],
  },
  manifest: "/icons/site.webmanifest",
  openGraph: {
    images: [{ url: "/icons/og-image-page.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/icons/og-image-page.png"],
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: designTokens.color.page,
};

function themeCss(): string {
  const color = designTokens.color;
  const weight = designTokens.font.weight;
  return [
    `--color-primary:${color.primary}`,
    `--color-indigo-50:${color.indigo50}`,
    `--color-lavender-100:${color.lavender100}`,
    `--color-page:${color.page}`,
    `--color-profile:${color.profile}`,
    `--color-indigo-100:${color.indigo100}`,
    `--color-indigo-700:${color.indigo700}`,
    `--color-indigo-900:${color.indigo900}`,
    `--color-heading:${color.heading}`,
    `--color-foreground:${color.foreground}`,
    `--color-caption:${color.caption}`,
    `--color-danger:${color.danger}`,
    `--color-canvas:${color.canvas}`,
    `--color-border:${color.border}`,
    `--radius-sm:${designTokens.radius.sm}`,
    `--radius-md:${designTokens.radius.md}`,
    `--radius-lg:${designTokens.radius.lg}`,
    `--radius-default:${designTokens.radius.default}`,
    `--space-3:${designTokens.space[3]}`,
    `--shadow-faint:${designTokens.shadow.faint}`,
    `--font-fallback:"${designTokens.font.family}", ${designTokens.font.fallback.join(", ")}`,
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
