# Style & Conventions
- Written in TypeScript with React functional components; `app/page.tsx` is a client component using React state hooks.
- Localization handled via inline dictionaries instead of i18n frameworks; keep KO/EN strings in sync.
- Styling leverages Tailwind-style utility classes directly in JSX plus global CSS (`app/globals.css`).
- Server logic in App Router API routes (`app/api/*`) uses async/await and returns `NextResponse` JSON.
- Heuristic logic for offline analysis lives in `lib/analyzeFallback.ts`; reuse rather than duplicating in components.