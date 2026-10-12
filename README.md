# Brecin: Brendan's Lead Board

*Back to the fun.*

A private, phone-first board where Michael finds construction projects and Brendan rates them **Good / Maybe / Bad** with one thumb. Built from Soul's brief, *CLAUDE BUILD BRIEF — Brendan Framing Lead Board — Mobile-First MVP — 2026-10-11*.

## What it does

- **Lead cards**: project, city, bid deadline, scope, and value only when it's confirmed. Each card has three big rating buttons that are always visible.
- **One project, many ways to bid it**: Magnolia + Naranca shows as one card with three general-contractor routes, so its value counts once.
- **Honest links**: "Open original ad" appears only when we have the poster's own listing. Aggregator links say **UNVERIFIED** and are labeled "Open source listing". With no link on file you see a warning, not a button.
- **Call / Email** buttons appear only when a dialable number or a real address exists. Research leads get no contact buttons.
- **Rating and follow-up stage are separate.** Stages: New → Contacted → Estimating → Quote Sent → Won / Lost. Each GC route has its own stage.
- **Notes and history** show who did what and when.
- **Saves are real**: "Saved" appears only after the database confirms. A failed save shows an error and leaves the old value in place.
- **Live sync**: a change on one phone shows up on the other without a refresh.
- Search, rating and stage filters, soonest-deadline or newest sorting, archive, and CSV export (Michael only).

## Who can do what

The database enforces this through row-level security and server functions. The app only mirrors it.

| | Michael (`admin`) | Brendan (`reviewer`) |
|---|---|---|
| See leads, notes, history | ✅ | ✅ |
| Rate Good / Maybe / Bad | ✅ | ✅ |
| Change follow-up stage | ✅ | ✅ |
| Add notes | ✅ | ✅ |
| Add / edit leads, archive, export | ✅ | — |

Anyone else who signs in sees "Ask Michael to add you" and no data.

## Setup (about 15 minutes, free tier)

### 1. Create the database
1. Make a free account at [supabase.com](https://supabase.com) and create a project. Pick the US West region.
2. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and run it.
3. Make a new query, paste `supabase/seed.sql`, and run it. This loads Soul's 4 bid projects (6 contractor routes), the 3 residential research items, and the architect partner.

### 2. Lock sign-in to the two of you
1. **Authentication → Sign In / Providers**: keep **Email** on and turn **Allow new users to sign up** off.
2. **Authentication → Users → Add user → Send invitation**: invite Michael's email and Brendan's email.
3. **Authentication → URL Configuration**: set **Site URL** to wherever the app runs (for example `http://localhost:3000` while testing). Add `<that URL>/auth/callback` under **Redirect URLs**.

### 3. Add the two users to the board
Run this in the SQL Editor, swapping in the real emails:

```sql
insert into public.profiles (id, display_name, role)
select id, 'Michael', 'admin' from auth.users where email = 'MICHAEL@EMAIL';
insert into public.profiles (id, display_name, role)
select id, 'Brendan', 'reviewer' from auth.users where email = 'BRENDAN@EMAIL';
```

### 4. Connect the app
Copy `.env.example` to `.env.local` and fill in the values from **Project Settings → API**. Use the Project URL and the `anon` public key. Never use the service-role key here.

```bash
npm install
npm run dev        # http://localhost:3000
```

Sign in with the emailed link on your phone.

### 5. Put it on your phones (needs Michael's OK)
Import the repo into Vercel and add the same two environment variables. Then add the Vercel URL to Supabase's Site URL and Redirect URLs. On each phone, open it and choose **Add to Home Screen**.

## Preview mode

With no Supabase keys set, the app shows the starter leads with a banner that says nothing is saved. Every tap returns "Not saved". It's for checking the layout and never pretends to save.

## Checks

```bash
npm test           # 26 unit tests: provenance, permissions, one-project value, filters, CSV safety
npm run build      # type-check + production build
```

Screenshots in `screenshots/` were captured at 320, 360, 390, 430 and 768 px wide. At every width an automated check confirmed:
- no sideways scrolling
- no clipped text
- every control is at least 48 px tall
- body text is at least 16 px (it's 17 px)
- "Back to the fun" is visible above the fold

It also checked that a failed save shows an error and does **not** mark the button as chosen.

## Ground rules this build keeps

- Missing original links are labeled UNVERIFIED and are never swapped for a generic link.
- Nothing is marked "contacted" unless someone records it.
- Residential items are research only. The architect is a potential partner, not a job.
- There's no referral-fee math, no outreach, no paid services, and no production deploy without Michael's approval.
- Every lead needs a freshness check before anyone calls. `date_checked` in the starter data is the handoff date, not a fresh check.

## Still open

- **Brendan's 30-second test**: he should rate three leads in 30 seconds without help. That has to be checked with Brendan on his phone.
- **Two-device sync**: verify it once the database is connected.
- **Add/edit lead form**: for v1, Michael adds and edits leads in Supabase's table editor, and the database already restricts that to him. An in-app form is the natural next step.
