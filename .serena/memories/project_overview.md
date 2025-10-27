# OP-6 Lie Analyzer
- **Purpose**: Next.js web app that ingests conversation transcripts/documents and produces a deception analysis dashboard. Primary results come from GitHub Models (gpt-4.1) with a heuristic fallback when the model is unavailable.
- **Key features**: client-side dashboard (`app/page.tsx`) with radar visualization, realtime feed simulation, and localized KO/EN copy; `/api/analyze` server route handles file upload, text extraction (txt/csv/json/html/pdf), and model invocation.
- **Structure**:
  - `app/`: App Router pages, layout, styling, and API route (`api/analyze`).
  - `components/`: shared UI like `HexRadarChart`.
  - `lib/`: shared logic (`analyzeFallback`, `site-config`).
  - `public/`: static assets.
- **Integration**: expects `GITHUB_MODELS_TOKEN`; when missing or model fails, falls back to `lib/analyzeFallback.ts` heuristics.