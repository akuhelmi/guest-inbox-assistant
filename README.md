# Guest Inbox Assistant

A demo app for short-term rental operators. It reads guest messages, sorts each one into a
category, flags the urgent ones and drafts a reply. The host reviews, edits and sends: the app
never sends anything itself.

> **Demo only.** Every property, guest and message is invented. Do not paste real guest data.

**Live demo:** https://guest-inbox-assistant.vercel.app

## What it does

| | |
|---|---|
| **Sort** | Each message gets one category: check-in, complaint, maintenance, booking change or general question. |
| **Flag** | Messages that need action within the hour (locked out, no water or power, gas, flooding) are marked urgent and listed first. |
| **Draft** | A short, warm reply with a concrete next step, ready to edit and copy. |
| **Facts, not guesses** | Each property has a fact sheet (check-in, Wi-Fi, parking, rules, contacts). Drafts use only those facts and show which ones they used; anything not on the sheet gets "I'll check" instead of an invented answer. |
| **Confidence** | Every draft says how sure it is. Low confidence is marked **Needs host**, so a person checks before replying. |
| **Guest's language** | The live AI replies in the language the guest wrote in (the inbox includes Malay, Chinese and French examples). |
| **Try it** | Pick a property, paste any guest message and see it sorted and answered live from that property's facts (rate-limited, never stored). |

## Architecture

```
 Browser (React + TypeScript, Vite)
        │  /api/*
        ▼
 FastAPI (Python) ──► triage layer ──► Gemini (LLM_PROVIDER=gemini)
        │                     └──────► offline rules (default, and the fallback on any error)
        ▼
 Postgres (Supabase) in production · SQLite for local development
```

- **Switchable LLM layer** (`backend/app/triage/`): every provider implements one `triage()`
  method. `LLM_PROVIDER` picks it; if the provider fails, times out or runs out of quota, the
  offline rules answer instead, so the demo never shows an error. Adding another provider means
  one new class.
- **Saved triage:** the seeded inbox stores its triage results, so the page loads instantly
  without spending LLM quota. "Re-run live" calls the provider on demand.
- **Offline rules stay honest:** without the AI they still pick facts from the sheet, spot
  Malay, Chinese or French, and say so ("Live AI replies in the guest's language") instead of
  pretending to translate. Those drafts are marked Needs host.
- **Self-upgrading demo data:** a data version is stored in the database. When a deploy brings a
  newer one, the demo tables are rebuilt and reseeded on the first request (all data is fake);
  the rate-limit counters are kept. No manual migrations.
- **Guards on the public box:** 1,000-character cap and 10 live runs per visitor per hour,
  counted in the database (salted hash, never the raw IP). Pasted text is not stored.

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
| `LLM_PROVIDER` | `offline` | `offline` or `gemini`. |
| `GEMINI_API_KEY` | (empty) | Required for `gemini`; without it the offline rules are used. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Any Gemini model with JSON output. |
| `MAX_MESSAGE_CHARS` | `1000` | Length cap for pasted messages. |
| `RATE_LIMIT_PER_HOUR` | `10` | Live runs per visitor per hour. |
| `RATE_LIMIT_SALT` | `local-dev-salt` | Salt for the visitor hash; set your own in production. |

## Tests and CI

```bash
cd backend && ruff check . && pytest              # 57 tests
cd frontend && npm run lint && npm test && npm run build
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
| `POST` | `/api/messages/{id}/triage` | Re-run the live provider (shown, not stored). |
| `POST` | `/api/triage` | Triage pasted text `{ "body", "guest_name" }`. |
| `GET` | `/api/meta` | Active provider, categories, limits. |

Interactive docs at `/docs` when running locally.

## How it was built

Built with AI assistance (Claude) and reviewed and approved by a human at every step, which is
also how the app is meant to be used: AI drafts, a person decides.
