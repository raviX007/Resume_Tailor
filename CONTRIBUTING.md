# Contributing

## Getting Started

1. Fork and clone the repository
2. Follow the [Quick Start](README.md#quick-start) guide to set up both backend and frontend
3. Create a branch for your changes: `git checkout -b feature/your-feature`

## Development Workflow

All common commands are available via the Makefile at the project root:

```bash
make install       # Create backend .venv + install deps, run npm install
make dev-backend   # Start backend on port 8001 (uses .venv)
make dev-frontend  # Start frontend on port 3001
make test          # Run all tests (backend + frontend)
make test-cov      # Backend tests with coverage report
make lint          # Lint frontend (ESLint)
make clean         # Remove caches and build artifacts
```

`make install` creates `backend/.venv` automatically and installs all Python deps into it. No need to manually activate the venv — all Make targets use `.venv/bin/` directly.

### Running commands manually

If you prefer running commands directly instead of via Make:

```bash
# Backend (always use .venv)
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8001
cd backend && .venv/bin/pytest -q
cd backend && .venv/bin/pytest --cov=app --cov-report=term-missing

# Frontend
cd frontend && npm run dev
cd frontend && npm test
cd frontend && npm run lint
cd frontend && npm run build
```

## Code Style

### Backend
- **Python 3.11+** with type hints
- All constants in `app/core/constants.py` — no magic numbers in service code
- Pydantic models for all request/response schemas (`app/models.py`)
- Async functions for all I/O operations
- Specific exception handling — no bare `except Exception`

### Frontend
- **TypeScript** with strict mode
- **Tailwind CSS** for styling — no CSS modules
- `"use client"` directive on components with state or event handlers
- Types in `src/lib/types.ts` — should mirror backend Pydantic schemas
- `React.memo` for components receiving frequently-changing parent props

## Testing

### Backend Tests (207 tests)
- Tests live in `backend/tests/`
- All LLM-dependent tests mock `get_llm_client` and `get_prompt_messages`
- Rate limiting is auto-disabled via `conftest.py` fixture
- Coverage minimum: 70% (enforced in CI)
- Run: `make test` or `cd backend && .venv/bin/pytest -q`

### Frontend Tests (39 tests)
- Component tests in `src/components/__tests__/`
- Utility tests co-located: `src/lib/utils.test.ts`
- Use Vitest + React Testing Library + @testing-library/user-event
- Always include ARIA/accessibility assertions
- Run: `make test` or `cd frontend && npm test`

## Adding a New Backend Service

1. Create the service file in `app/services/`
2. If it calls an LLM: use `get_llm_client()` and `get_prompt_messages()`
3. Add constants to `app/core/constants.py`
4. Add Pydantic models to `app/models.py`
5. Write tests in `tests/` mocking LLM calls
6. If it needs a new Langfuse prompt: add to `scripts/push_prompts.py`

## Adding a New Frontend Component

See the [frontend README](frontend/README.md#adding-a-new-component) for step-by-step guide.

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Ensure all tests pass: `make test` (runs backend 207 + frontend 39 tests)
- Ensure the build succeeds: `cd frontend && npm run build`
- Update documentation if you change behavior or add features

## Project Structure

See the [root README](README.md#architecture) for the full project structure and the [docs/](docs/) directory for detailed documentation on architecture, testing, security, and deployment.
