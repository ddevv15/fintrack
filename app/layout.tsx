import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { env } from "@/lib/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env().APP_URL),
  title: "FinTrack",
  description:
    "A personal money tracker to log a spend, see the month, and understand the pattern.",
  applicationName: "FinTrack",
  openGraph: {
    title: "FinTrack — Know where the month went",
    description:
      "A personal money tracker to log a spend, see the month, and understand the pattern.",
    url: "/",
    siteName: "FinTrack",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FinTrack — Know where the month went",
    description:
      "A personal money tracker to log a spend, see the month, and understand the pattern.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
