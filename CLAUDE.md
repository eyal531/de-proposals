# Notes for working on this repo

Proposal (quote) system for Digital Effective, an Israeli digital agency. UI is Hebrew, RTL. The functional spec (Word, v0.2) defines chapters referenced in code comments (e.g. "spec 9.2").

## Stack
- Next.js 15 App Router, TypeScript, Tailwind v4 (component classes in `src/app/globals.css` inside `@layer components` so utilities override them).
- Supabase: Postgres + Auth. Schema and RLS in `supabase/migrations/` (never edit an applied migration; add a new file). Deployed by `.github/workflows/supabase-migrate.yml`.
- Vercel deploys the app from `main`.

## Key modules
- `src/lib/pricing/engine.ts` – pure pricing engine shared by server and browser. Media budgets are per platform (`proposals.media_budgets`); all `hybrid_max` lines form one pooled media-management fee = MAX(sum of their base fees, media_fee_percent × total media) (`MediaPool`). Covered by `engine.test.ts`; add tests for any pricing change.
- Client proposal design: `src/components/proposal/*` + `.pdoc*` styles in `globals.css`. Branding (logo, accent, font, cover) lives in `app_settings.brand`; uploaded logos in Supabase Storage bucket `branding`; default logo files in `public/brand`.
- `src/lib/pricing/approvals.ts` – approval thresholds (levels none/manager/ceo).
- `src/lib/greeting.ts` – "לכבוד" block, salutation, gendered wording. `src/lib/email-domain.ts` – business vs free email, website guess.
- AI (spec 9): `src/lib/ai/site.ts` reads the client site + technical signals; `src/lib/ai/analyze.ts` prompt/schema/sections; `src/lib/ai/claude.ts` raw Messages API with web search + forced `submit_analysis` tool; model chosen in settings (`app_settings.ai_model`: economy=Haiku, quality=Sonnet), cost in `cost.ts`. The analysis is deliberately short (sales document, not a report). Routes `/api/ai/analyze` and `/api/ai/rewrite`. AI sections are drafts (`source: "ai"`, `aiKey`) and block sending until approved.
- `src/app/(app)/proposals/actions.ts` – server actions (create, save, approval, send). Status transitions live here.
- Client page `src/app/p/[token]` + `src/app/api/p/[token]/*` use the service-role client. Only `toPublic()` output may reach the browser (no internal notes).

## Conventions
- Employees act through RLS (`createClient()`); service role only for the public client page.
- Keep user-facing text in Hebrew; code and comments in English.
- Before pushing: `npm test && npx tsc --noEmit && npx eslint src && npm run build`.
