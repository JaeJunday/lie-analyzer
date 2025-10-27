import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://lie-analyzer.vercel.app";

export const metadata: Metadata = {
  title: "Lie Analyzer | Veracity Intelligence Unit",
  description:
    "Professional linguistic deception profiler that extracts risk signals from uploaded conversation transcripts.",
  metadataBase: new URL(siteUrl),
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Lie Analyzer | Veracity Intelligence Unit",
    description:
      "Professional linguistic deception profiler that extracts risk signals from uploaded conversation transcripts.",
    url: siteUrl,
    siteName: "OP-6 Lie Analyzer",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "OP-6 Veracity Oracle - Lie Analyzer interface preview",
      },
    ],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lie Analyzer | OP-6 Veracity Oracle",
    description:
      "Linguistic deception profiler combining forensic LLM prompts with rule-based validation.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
