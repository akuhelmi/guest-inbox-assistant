# Guest Inbox Assistant

A demo app for short-term rental operators. It reads guest messages, sorts each one into a
category, flags the urgent ones and drafts a reply. The host reviews, edits and sends: the app
never sends anything itself.

> **Demo only.** Every property, guest and message is invented. Do not paste real guest data.

**Live demo:** https://guest-inbox-assistant.vercel.app

## What it does

Every guest message arrives sorted and reviewed. The host opens one, agrees to the assistant's
plan, and goes through it one step at a time. Nothing happens without the host's click.

| | |
|---|---|
| **Inbox as a work queue** | Urgent messages first, then the longest waiting. Views for To do, Replied, Done and All, plus a filter per topic (check-in, complaint, maintenance, booking change, general question). Each message shows its channel (Airbnb, Booking.com, WhatsApp) and how long the guest has waited. |
| **Review and plan** | Opening a message starts a thread. The assistant's first message says what the guest wants and proposes a numbered plan: create a task and notify the right person, reply to the guest, set the status. The host agrees, or replies to change the plan (e.g. "skip the task", "make it warmer"). |
| **Step by step** | After "Agree & proceed" each step arrives as its own message to approve, edit, skip or discuss. The host's clicks show in the thread, which ends with "All steps done" and a link to the next message. |
| **Facts, not guesses** | Each property has a fact sheet (check-in, Wi-Fi, parking, rules, contacts). Drafts use only those facts and show which ones they used; anything not on the sheet gets "I'll check" instead of an invented answer. |
| **Confidence** | Every draft says how sure it is. Low confidence is marked **Needs host**, so a person checks before replying. |
| **Guest's language** | The live AI replies in the language the guest wrote in (the inbox includes Malay, Chinese and French examples). |
| **The team's day** | An invented team of five (maintenance, cleaning, an all-rounder) with bases, travel times and jobs, scheduled from the moment the visitor opens the demo. The Tasks tab shows who is busy and until when. |
| **Right person, honest timing** | A task goes to the person with the right skill who can arrive first, and the step says why ("Ravi is closer but busy until 3:40 pm"). If nobody can make the target, it says so. The host can pick someone else. |
| **Who is coming, and when** | For a job on site the task comes first, so the reply tells the guest who is coming and about when, in their language. If the person changes, the reply changes too; if it was already sent, the guest gets a short update. |
| **Escalation** | After a task is sent, "Simulate: no answer" passes it down the chain to the host, and "Simulate: confirms" closes it. |
| **New guest message** | Describe a message ("a French guest can't find the parking") or paste one. The AI writes it, sorts it and drafts a reply; "Add to inbox" opens its thread. Kept in your browser only. |
| **Reply time** | Urgent messages are overdue after 15 minutes, others after an hour. |
| **Phone layout** | On a phone the inbox, a message and the composer each open full screen. |

## Architecture

```
 Browser (React + TypeScript, Vite): queue, threads, team logic, your statuses and tasks
        │  /api/*
        ▼
 FastAPI (Python) ──► provider layer ──► Gemini (live site)
        │                     ├────────► Claude via the local Claude Code CLI (local preview only)
        │                     └────────► offline rules and templates (default, and the fallback)
        ▼
 Postgres (Supabase) in production · SQLite for local development
```

- **Switchable LLM layer** (`backend/app/triage/`, `backend/app/agent/`, `backend/app/compose.py`):
  each provider implements the same small interface. `LLM_PROVIDER` picks it; if the provider
  fails, times out or runs out of quota, the offline rules answer instead, so the demo never
  shows an error. Adding another provider means one new class per job.
- **The assistant only proposes:** `POST /api/agent` returns text plus cards (a draft, a task, a
  status), checked on the server (real message ids, facts from the sheet only). The browser
  applies a card only when the host approves it.
- **Team logic is pure and tested** (`frontend/src/lib/team.ts`): who has the skill, when they
  are free (travel plus 45 minutes on site, around their other jobs), who arrives first, the
  escalation chain, and the sentence the guest gets about the visit.
- **Saved triage:** the seeded inbox stores its triage results, so the page loads instantly
  without spending AI quota.
- **Offline rules stay honest:** without the AI they still pick facts from the sheet, spot
  Malay, Chinese or French, and say so ("Live AI replies in the guest's language") instead of
  pretending to translate. Those drafts are marked Needs host.
- **Your clicks stay in your browser:** statuses, tasks, threads and added messages are saved in
  `localStorage`, so every visitor starts from the same inbox and nobody changes it for others.
  "Reset demo" clears them and starts a new team day.
- **Ages stay fresh:** the saved examples keep their seeded age ("6 min ago") however long ago
  the data was loaded, so reply times on the live demo stay meaningful.
- **Self-upgrading demo data:** a data version is stored in the database. When a deploy brings a
  newer one, the demo tables are rebuilt and reseeded on the first request (all data is fake);
  the rate-limit counters are kept. No manual migrations.
- **Daily AI limit:** 30 AI replies per visitor per day (a thread answer or a new guest message
  counts as one). After that the rule-based answers and templates take over. Counted in the
  database with a salted hash, never the raw IP. Typed text is never stored.

## Run it locally

Requirements: Python 3.10+ and Node 20+.

```bash
# Backend (port 8000)
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload

# Frontend (port 5173, proxies /api to the backend)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The first request creates the tables and loads the demo data into a
local SQLite file. To start again: `python -m app.seed --reset` (from `backend/`).

### With Docker

```bash
docker build -t guest-inbox-assistant .
docker run -p 8000:8000 guest-inbox-assistant
```

Open http://localhost:8000. One image serves both the API and the built frontend.

### Configuration

All settings are environment variables with safe defaults (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./guest_inbox.db` | Any Postgres URL works, e.g. Supabase. |
| `LLM_PROVIDER` | `offline` | `offline`, `gemini`, or `claude` (local only, see below). |
| `GEMINI_API_KEY` | (empty) | Required for `gemini`; without it the offline rules are used. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Any Gemini model with JSON output. |
| `LLM_TIMEOUT_SECONDS` | `8` | Timeout for one sorting call. |
| `AGENT_LIMIT_PER_DAY` | `30` | AI replies per visitor per day (assistant and new guest messages). |
| `AGENT_TIMEOUT_SECONDS` | `12` | Timeout for one assistant or composer call. |
| `CLAUDE_MODEL` | `claude-sonnet-5-5` | Model for `claude`. |
| `CLAUDE_BIN` | `claude` | Path to the Claude Code CLI for `claude`. |
| `CLAUDE_TIMEOUT_SECONDS` | `45` | Timeout for one `claude` call. |
| `MAX_MESSAGE_CHARS` | `1000` | Length cap for typed messages. |
| `RATE_LIMIT_PER_HOUR` | `10` | Live re-runs per visitor per hour. |
| `RATE_LIMIT_SALT` | `local-dev-salt` | Salt for the visitor hash; set your own in production. |

`LLM_PROVIDER=claude` runs the Claude Code CLI you are signed in to on your own machine
(`claude -p`), with no API key in the app. It is for a local preview only, never for a public
deployment.

## Tests and CI

```bash
cd backend && ruff format --check . && ruff check . && pytest    # 179 tests
cd frontend && npm run lint && npm test && npm run build       # 66 tests
```

GitHub Actions runs on every push: backend tests against a real Postgres, frontend lint,
typecheck, tests and build, and a Docker build with a smoke test. A green run on `main` deploys
to Vercel (static frontend + FastAPI as a Python function), with Supabase Postgres as the live
database.

## API

| Method | Path | |
|---|---|---|
| `GET` | `/api/messages?category=&urgent=` | Inbox, urgent first, then newest. |
| `GET` | `/api/messages/{id}` | One message with its triage. |
| `GET` | `/api/properties` | The fact sheets. |
| `GET` | `/api/team` | The team, travel times and today's jobs (minutes from the demo start). |
| `POST` | `/api/agent` | One assistant turn: text, plus proposed cards for the host to approve. |
| `POST` | `/api/compose` | Write a guest message from a brief (or keep a pasted one), then sort and draft it. Not stored. |
| `POST` | `/api/messages/{id}/triage` | Re-run the live provider (shown, not stored). |
| `POST` | `/api/triage` | Triage typed text `{ "body", "guest_name", "property_id" }`. |
| `GET` | `/api/meta` | Active provider, categories, limits. |

Interactive docs at `/docs` when running locally.

## How it was built

Built with AI assistance (Claude) and reviewed and approved by a human at every step, which is
also how the app is meant to be used: AI drafts, a person decides.
