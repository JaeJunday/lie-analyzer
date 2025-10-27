import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { siteName, siteUrl } from "@/lib/site-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lie Analyzer | Veracity Intelligence Unit",
  description:
    "Professional linguistic deception profiler powered by RoBERTa-LIAR and DeBERTa-v3 ensembles with rule-based validation.",
  metadataBase: new URL(siteUrl),
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Lie Analyzer | Veracity Intelligence Unit",
    description:
      "Professional linguistic deception profiler powered by RoBERTa-LIAR and DeBERTa-v3 ensembles with rule-based validation.",
    url: siteUrl,
    siteName,
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
      "Linguistic deception profiler combining RoBERTa-LIAR ensembles with rule-based validation.",
    images: ["/og-image.png"],
  },
  other: {
    "google-adsense-account": "ca-pub-8192725368161923",
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
