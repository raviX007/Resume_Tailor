# Deployment

## Docker

### Build

```bash
docker build -t resume-tailor-backend backend/
```

Or via Makefile:
```bash
make docker-build
```

### Dockerfile Walkthrough

**File:** `backend/Dockerfile`

```dockerfile
FROM python:3.12-slim

# 1. Install pdflatex (required for PDF compilation)
RUN apt-get update && \
    apt-get install -y --no-install-recommends texlive-base texlive-latex-extra && \
    rm -rf /var/lib/apt/lists/*

# 2. Non-root user (security hardening)
RUN useradd --create-home appuser

WORKDIR /app

# 3. Install Python deps (cached layer — only rebuilds when requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 4. Copy application code
COPY . .

# 5. Output directory with correct ownership
RUN mkdir -p output && chown appuser:appuser output

# 6. Switch to non-root user
USER appuser

EXPOSE 8001

# 7. Container health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/api/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

**Layer caching strategy:** `requirements.txt` is copied and installed before the application code. This means code changes don't invalidate the dependency layer, making rebuilds fast.

### Run

```bash
docker run -p 8001:8001 \
  -e OPENAI_API_KEY=sk-... \
  -e LANGFUSE_PUBLIC_KEY=pk-... \
  -e LANGFUSE_SECRET_KEY=sk-... \
  resume-tailor-backend
```

### Verify

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' <container_id>

# Check health endpoint
curl http://localhost:8001/api/health
# {"status":"ok","service":"resume-tailor","version":"1.0.0","uptime_seconds":42}
```

### Frontend Dockerfile

**File:** `frontend/Dockerfile`

Three-stage build that produces a minimal production image (~150 MB vs ~1 GB for a full `node_modules` image):

```dockerfile
FROM node:20-alpine AS base

# Stage 1: Install dependencies (cached when package.json unchanged)
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the Next.js app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined at build time
ARG NEXT_PUBLIC_API_URL=http://localhost:8001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# Stage 3: Production — only standalone output (no node_modules)
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

**Key details:**
- `next.config.ts` sets `output: "standalone"` — Next.js copies only the files needed to run (no `node_modules` in the final image)
- `NEXT_PUBLIC_API_URL` is a build arg, not a runtime env var — Next.js inlines `NEXT_PUBLIC_*` variables into the JavaScript bundle at build time
- Non-root user (`nextjs`) for security

### Build Frontend

```bash
docker build -t resume-tailor-frontend frontend/

# Override the backend URL at build time:
docker build -t resume-tailor-frontend \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  frontend/
```

---

## Docker Compose

**File:** `docker-compose.yml`

Run both services with a single command:

```bash
# Set your API key and start both services
OPENAI_API_KEY=sk-... docker compose up --build
```

The compose file orchestrates both containers:
- **Backend** starts first, exposed on port `8001`, with a health check
- **Frontend** waits for the backend health check to pass (`depends_on: condition: service_healthy`), then starts on port `3000`
- `NEXT_PUBLIC_API_URL` is passed as a build arg so it's inlined into the frontend JavaScript bundle

```yaml
services:
  backend:
    build: ./backend
    ports: ["8001:8001"]
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
    healthcheck:
      test: ["CMD", "python", "-c", "...urlopen('http://localhost:8001/api/health')"]
      interval: 30s
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      args:
        - NEXT_PUBLIC_API_URL=http://localhost:8001
    ports: ["3000:3000"]
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped
```

**Verify:**
```bash
# Both services running
curl http://localhost:8001/api/health   # Backend
curl http://localhost:3000              # Frontend
```

---

## Health Check

**File:** `backend/app/routes/health.py`

```python
@router.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "resume-tailor",
        "version": "1.0.0",
        "uptime_seconds": round(time.monotonic() - _start_time),
    }
```

| Field | Purpose |
|-------|---------|
| `status` | Always `"ok"` — indicates the process is running |
| `service` | Service identifier for multi-service environments |
| `version` | Matches `FastAPI(version=...)` — verify correct deployment |
| `uptime_seconds` | How long since the process started — detect unexpected restarts |

---

## CI/CD Pipeline

**File:** `.github/workflows/ci.yml`

GitHub Actions runs on every push to `main` and every pull request:

```yaml
jobs:
  backend:     # Python tests + coverage
  frontend:    # Node tests + lint + build
  docker:      # Docker image build
```

### Backend Job

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: "3.12"
    cache: pip
    cache-dependency-path: backend/requirements-dev.txt

- run: pip install -r requirements-dev.txt
- run: pytest --cov=app --cov-report=term-missing --cov-fail-under=70
```

- **Coverage threshold:** 70% minimum (enforced in CI and `pyproject.toml`)
- **Cache:** pip dependencies are cached by the hash of `requirements-dev.txt`

### Frontend Job

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: npm

- run: npm ci        # deterministic install from lockfile
- run: npx vitest run
- run: npm run lint
- run: npm run build  # catches TypeScript/build errors
```

### Docker Job

```yaml
- run: docker build -t resume-tailor-backend backend/
```

Validates that the Docker image builds successfully — catches missing dependencies or Dockerfile errors before deployment.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | OpenAI API key for GPT-4o-mini |
| `GOOGLE_AI_API_KEY` | No | — | Google AI key for Gemini fallback |
| `LANGFUSE_PUBLIC_KEY` | No | — | Langfuse public key for prompt fetching |
| `LANGFUSE_SECRET_KEY` | No | — | Langfuse secret key |
| `LANGFUSE_HOST` | No | `https://cloud.langfuse.com` | Langfuse server URL |
| `LLM_MODEL` | No | `gpt-4o-mini` | Primary LLM model name |
| `GEMINI_MODEL` | No | `gemini-2.0-flash` | Fallback LLM model name |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000,http://localhost:3001` | Comma-separated CORS origins |
| `BASE_TEX_PATH` | No | `resume_base.tex` | Path to the base LaTeX template file |
| `OUTPUT_DIR` | No | `output` | Directory for compiled PDF and LaTeX output |
| `LOG_LEVEL` | No | `INFO` | Python logging level |

### Frontend (`frontend/.env.local`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:8001` | Backend API URL |

---

## Requirements Files

| File | Purpose | When to Use |
|------|---------|-------------|
| `backend/requirements.txt` | Production dependencies only | Docker builds, production deployment |
| `backend/requirements-dev.txt` | Production + test dependencies | Local development, CI |

`requirements-dev.txt` includes `requirements.txt` via `-r requirements.txt` and adds:
- `pytest` — test runner
- `pytest-asyncio` — async test support
- `pytest-cov` — coverage measurement
