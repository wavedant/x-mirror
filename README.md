# X Mirror

`nikita bier's worst nightmare`

X Mirror is a lightweight analytics reflection tool for X Premium users. It takes a 12-month content analytics CSV, extracts patterns from the export, maps them to algorithm-friendly signals, and returns a cleaner strategy view: content lanes, timing, media lift, reply gaps, follow conversion, and tactical recommendations.

## Local run

```bash
npm install
npm run dev
```

Optional environment variables live in `.env.example`.

## Fastest production path

1. Deploy the repo to Vercel.
2. Add the environment variables from `.env.example`.
3. Create a Supabase project.
4. Run the SQL below.
5. Point your domain to Vercel.

## Supabase table

```sql
create extension if not exists pgcrypto;

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  twitter_handle text not null,
  twitter_id text,
  total_posts integer default 0,
  total_impressions bigint default 0,
  verification_json jsonb,
  rows_json jsonb,
  analysis_json jsonb
);
```

## Truthful gating note

Reliable blue-check verification is not meaningfully free if you want it to be robust. This repo supports two modes:

- Soft gate: if a user can export the Premium analytics CSV, let them in. This is the fastest launch path.
- Hard gate: set `X_BEARER_TOKEN` and use the verification function. This depends on X API access and pricing.

## Recommended launch stack

- Frontend: Vercel
- Storage: Supabase
- Domain: `thevibesco.com`

Suggested route: `xmirror.thevibesco.com` if you want this to feel like a product, or root-domain takeover if this is the whole launch.
