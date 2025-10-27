const DEFAULT_SITE_URL = "https://lie-analyzer.vercel.app";

const normalizeUrl = (url: string) => url.replace(/\/+$/, "");

export const siteUrl = normalizeUrl(
  process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL,
);

export const siteName = "OP-6 Lie Analyzer";

export const absoluteUrl = (path = "/") => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl}${normalizedPath}`;
};
