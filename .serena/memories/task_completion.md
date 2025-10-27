# Task Completion Checklist
1. Re-run `pnpm lint` (or `npm run lint`) to ensure code quality.
2. For major changes, build with `pnpm build` to verify Next.js compiles.
3. Manually test the `/api/analyze` route via the UI or API client when touching analysis logic, ensuring both model and fallback flows work.
4. Confirm localization strings (KO/EN) remain aligned after edits.