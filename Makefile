.PHONY: install test test-cov lint dev-backend dev-frontend docker-build clean help

# Paths
VENV       := backend/.venv
PIP        := $(VENV)/bin/pip
PYTEST     := $(VENV)/bin/pytest
UVICORN    := $(VENV)/bin/uvicorn
RUFF       := $(VENV)/bin/ruff

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

# ── Setup ─────────────────────────────────────────────────────────────

$(VENV)/bin/activate:
	python3.12 -m venv $(VENV)

$(VENV)/.installed: $(VENV)/bin/activate backend/requirements-dev.txt backend/requirements.txt
	$(PIP) install -r backend/requirements-dev.txt
	@touch $@

frontend/node_modules/.installed: frontend/package.json
	cd frontend && npm install
	@touch $@

install: $(VENV)/.installed frontend/node_modules/.installed ## Install all dependencies (backend + frontend)
	@echo "Done — backend .venv and frontend node_modules are up to date"

# ── Test ──────────────────────────────────────────────────────────────

test: $(VENV)/.installed frontend/node_modules/.installed ## Run all tests (backend + frontend)
	cd backend && .venv/bin/pytest -q
	cd frontend && npx vitest run

test-cov: $(VENV)/.installed ## Run backend tests with coverage report
	cd backend && .venv/bin/pytest --cov=app --cov-report=term-missing --cov-fail-under=70

# ── Lint ──────────────────────────────────────────────────────────────

lint: frontend/node_modules/.installed ## Lint frontend
	cd frontend && npm run lint

# ── Dev Servers ───────────────────────────────────────────────────────

dev-backend: $(VENV)/.installed ## Start backend dev server (port 8001)
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8001

dev-frontend: frontend/node_modules/.installed ## Start frontend dev server (port 3001)
	cd frontend && npm run dev -- -p 3001

# ── Docker ────────────────────────────────────────────────────────────

docker-build: ## Build backend Docker image
	docker build -t resume-tailor-backend backend/

# ── Clean ─────────────────────────────────────────────────────────────

clean: ## Remove caches and build artifacts
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find backend -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	rm -rf backend/output/*.pdf backend/output/*.tex backend/output/*.log
	rm -rf frontend/.next frontend/node_modules/.cache
