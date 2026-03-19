# K8s Support Bundle Analyzer

AI-powered analysis tool for Kubernetes [Troubleshoot](https://troubleshoot.sh) support bundles. Upload a `.tar.gz` bundle and get an instant, structured diagnosis with severity levels, evidence-based findings, and an interactive chat to drill deeper.

## How It Works

```
Upload .tar.gz  →  Extract  →  Rule Scanner (20 rules)  →  LLM Analysis (GPT-4o)  →  Streamed Report + Chat
                                      ↓                            ↓
                               Finds the WHAT              Explains the WHY
                          (CrashLoopBackOff, OOM, etc.)  (root cause, remediation)
```

1. **Upload** a Troubleshoot support bundle via the web UI
2. **Rule-based scanner** greps for 20 known K8s failure patterns (CrashLoopBackOff, OOMKilled, ImagePullBackOff, TLS errors, DNS failures, etc.)
3. **LLM analysis** receives rule findings + prioritized file contents + similar past incidents, then streams a structured diagnosis
4. **Chat interface** lets you ask follow-up questions scoped to the bundle
5. **Similar incidents** surface past analyses via pgvector embedding search

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Run It

```bash
# 1. Clone the repo
git clone <repo-url> && cd replicated-bundle-analyzer

# 2. Set up environment
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# 3. Start everything
docker compose up --build
```

That's it. Open [http://localhost:3000](http://localhost:3000) in your browser.

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8001
- **Health check**: http://localhost:8001/health

### First Use

1. Register an account on the login page
2. Click **Upload** in the sidebar
3. Drop a `.tar.gz` support bundle
4. Watch the analysis stream in real time
5. Ask follow-up questions in the chat sidebar

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + Tailwind CSS |
| Backend | FastAPI (Python, async) |
| AI | OpenAI GPT-4o + text-embedding-3-small |
| Database | PostgreSQL 16 + pgvector |
| Observability | LangFuse (optional) |

## Architecture

```
frontend/                       backend/
├── src/                        ├── api/
│   ├── pages/                  │   ├── auth.py          # JWT auth
│   │   ├── LoginPage           │   ├── bundles.py       # Upload + streaming analysis
│   │   ├── DashboardPage       │   ├── analysis.py      # Results + similar incidents
│   │   └── UploadPage          │   └── chat.py          # Chat with streaming
│   │   └── AnalysisPage        ├── analyzer/
│   ├── components/             │   ├── scanner.py       # 20 rule-based pattern matchers
│   │   ├── ChatSidebar         │   ├── analyzer.py      # LLM analysis + embeddings
│   │   ├── FileDropZone        │   ├── extractor.py     # .tar.gz extraction
│   │   ├── SeverityBanner      │   └── cluster_parser.py # Structured K8s data parsing
│   │   ├── FindingCard         ├── db/
│   │   ├── StreamingMarkdown   │   ├── init.sql         # Schema + pgvector setup
│   │   └── ...                 │   ├── database.py      # asyncpg pool
│   └── api.ts                  │   └── queries.py       # All DB operations
└── nginx.conf                  └── main.py              # FastAPI app
```

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Get JWT token |
| `POST` | `/bundles/upload` | Upload bundle, streams SSE analysis |
| `GET` | `/bundles` | List user's bundles |
| `GET` | `/analysis/{bundle_id}` | Get completed analysis |
| `POST` | `/chat/{analysis_id}` | Chat about analysis (streaming) |
| `GET` | `/chat/{analysis_id}` | Get chat history |
| `GET` | `/similar/{analysis_id}` | Find similar past incidents |
| `GET` | `/dashboard-data` | Dashboard aggregations |

## Rule Scanner

The scanner checks for 20 patterns across two categories:

**Infrastructure (K8s state)**
- CrashLoopBackOff, OOMKilled, ImagePullBackOff, RunContainerError
- NodeNotReady, PodEvicted, FailedScheduling, FailedMount, BackoffPullImage, Unhealthy

**Application (log signals)**
- StackTrace, HTTPServerError, ConnectionRefused, ConnectionTimeout
- ResourceExhaustion, DatabaseError, PermissionDenied, DNSResolutionFailure, TLSError

Files are scanned in priority order: `cluster-resources/events/` first (highest signal), then pods, then logs, then everything else.

## Running Tests

### Backend (pytest)

```bash
cd backend
pip install -r requirements.txt
pytest -v
```

### Frontend (vitest)

```bash
cd frontend
npm install
npm test
```

### Evals

```bash
cd backend
# Scanner eval against known bundles
python -m evals.eval_scanner

# LLM output quality eval
python -m evals.eval_llm
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4o and embeddings |
| `SECRET_KEY` | Yes | JWT signing secret (any random string) |
| `DATABASE_URL` | Auto | Set by docker-compose |
| `LANGFUSE_PUBLIC_KEY` | No | LangFuse tracing (optional) |
| `LANGFUSE_SECRET_KEY` | No | LangFuse tracing (optional) |
| `LANGFUSE_HOST` | No | Defaults to `https://cloud.langfuse.com` |

## Development

Run services individually for local development:

```bash
# Start just the database
docker compose up db

# Backend (with hot reload)
cd backend
uvicorn main:app --reload --port 8001

# Frontend (with hot reload)
cd frontend
npm run dev
```

The frontend dev server proxies `/api` requests to the backend automatically.
