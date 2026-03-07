# PodReader

A browser-based podcast reader that subscribes to RSS feeds, transcribes episodes using OpenAI Whisper (or local whisper.cpp), and produces AI-powered thematic summaries via OpenAI, Anthropic, or a local Ollama model. Supports YouTube videos via yt-dlp. Multi-user with per-user data isolation.

## Features

- Subscribe to podcast RSS feeds (or bulk-import via OPML)
- Paste YouTube video URLs to fetch captions or transcribe audio via yt-dlp
- Transcribe episodes via OpenAI Whisper API or local whisper.cpp
- Summarise transcripts using OpenAI (gpt-5-mini), Anthropic (Claude Sonnet), or Ollama (qwen2.5:3b-instruct)
- Automatic chunking and map-reduce for long transcripts with local models
- Multi-user authentication with per-user data isolation
- Server-side SQLite storage for feeds, episodes, transcripts, summaries, and settings
- Background feed refresh every 12 hours
- Resizable sidebar and episode panel with persistent layout
- CORS proxy for RSS feeds and audio downloads
- SSRF protection, per-user rate limiting, Helmet security headers

## Prerequisites

- **Node.js 22+** and npm
- **ffmpeg** (bundled via `ffmpeg-static`, but system install recommended as fallback)
- **yt-dlp** (required for YouTube video support)
- **API keys**: OpenAI (required for Whisper transcription), Anthropic (optional)
- **Ollama** (optional, for local LLM summarisation) — see `LOCAL_LLM_OPTIMISATION.md`

## Quick Start

```bash
# Clone and install
git clone https://github.com/your-org/podreader.git
cd podreader
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys and session secret

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite + Express concurrently (dev mode) |
| `npm run build` | Run tests, then build frontend (Vite) + compile server (TypeScript) |
| `npm start` | Run production server (serves built frontend + API) |
| `npm run preview` | Build then start |
| `npm test` | Run unit/integration tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:e2e` | Run Playwright E2E tests |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key (used for Whisper transcription and GPT summarisation) |
| `ANTHROPIC_API_KEY` | No | Anthropic API key (for Claude summarisation) |
| `SESSION_SECRET` | Production | Secret for signing session cookies (`openssl rand -hex 32`) |
| `CORS_ORIGIN` | Production | Allowed CORS origin (e.g. `http://192.168.1.11`) |
| `DB_PATH` | No | Path to SQLite database file (default: `/var/lib/podreader/podreader.db`) |
| `OLLAMA_CHUNK_THRESHOLD_CHARS` | No | Transcript length triggering map-reduce (default: 16000) |
| `OLLAMA_INFERENCE_TIMEOUT_MS` | No | Per-chunk Ollama timeout in ms (default: 1200000) |

## Architecture

```
┌─────────────────────────────────┐
│  React (Vite) — Browser        │
└──────────┬──────────────────────┘
           │ /api/*
┌──────────▼──────────────────────┐
│  Express (Node.js) — Port 3001 │
│  • SQLite (user data, sessions) │
│  • RSS feed proxy              │
│  • Audio download + chunking   │
│  • Whisper transcription relay │
│  • Summarisation relay         │
│  • YouTube info + transcripts  │
│  • Ollama / whisper.cpp mgmt   │
└──────────┬──────────────────────┘
           │
┌──────────▼──────────────────────┐
│  External APIs / Tools          │
│  OpenAI · Anthropic · Ollama    │
│  yt-dlp · whisper.cpp · ffmpeg  │
└─────────────────────────────────┘
```

Single `package.json`. In dev mode, Vite proxies `/api` to Express (port 3001). In production, Nginx serves static assets and reverse-proxies `/api`.

### Directory Structure

- `server/` — Express backend (routes, services, SQLite DB, auth, utilities)
- `src/` — React frontend (components, hooks, services, types)
- `shared/` — Shared TypeScript types used by both frontend and server
- `deploy/` — Deployment scripts and configs (systemd, nginx, Modelfile)
- `prompt.md` — AI system prompt defining summary format

## Customising the Summarisation Prompt

The system prompt that controls how summaries are generated lives in `prompt.md` at the project root. The server loads it once at startup via `server/promptLoader.ts` and sends it as the system message to whichever LLM provider is selected.

To customise it, edit `prompt.md` directly and restart the server. The prompt defines:

- **Output structure** — prose overview, propositional themes, practical takeaways
- **Target length** — 500-800 words
- **Tone** — terse, professional, applied, advisory

After editing, restart with `npm start` (production) or save the file and restart the dev server (`npm run dev`). No frontend changes are needed — all providers (OpenAI, Anthropic, Ollama) use the same prompt.

## Production Deployment

See `DEPLOYMENT.md` for a full guide covering systemd, Nginx, firewall, TLS, and monitoring. For automated deployment on Ubuntu 24.04:

```bash
sudo bash deploy/deploy.sh
```

## License

GPLv3 — see `LICENSE`.
