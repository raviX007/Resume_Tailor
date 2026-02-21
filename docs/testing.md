# Testing

## Overview

**246 tests total** across backend and frontend.

| Layer | Framework | Tests | Coverage |
|-------|-----------|-------|----------|
| Backend | pytest + pytest-asyncio | 207 | 76% |
| Frontend | Vitest + React Testing Library | 39 | — |

---

## Backend Test Organization

```
backend/tests/
├── conftest.py          # Shared fixtures, rate limiter disable
├── test_parser.py       # LaTeX parser: marker extraction, edge cases
├── test_injector.py     # LaTeX injector + writer: skill injection, reorder
├── test_reorderer.py    # Reorder plan computation
├── test_compiler.py     # Filename slugification, path generation
├── test_endpoint.py     # POST /api/tailor: validation, happy path, errors
├── test_stream_endpoint.py  # POST /api/tailor-stream: SSE events, progress, errors
├── test_services.py     # LLM services: extractor, matcher, analyzer (mocked)
├── test_routes.py       # Route validation: content-type, CORS headers, encoding
└── test_middleware.py   # Request ID middleware, exception handlers
```

### Test Categories

**Unit tests (deterministic, no mocks needed):**
- `test_parser.py` — Parse `.tex` by comment markers
- `test_reorderer.py` — Compute reorder plans from match results
- `test_compiler.py` — Filename slug generation

**Unit tests with mocks (LLM services):**
- `test_services.py` — All 3 LLM services with mocked `get_llm_client` and `get_prompt_messages`

**Integration-style tests (full route, mocked services):**
- `test_endpoint.py` — `POST /api/tailor` with `TestClient`, all services mocked
- `test_stream_endpoint.py` — `POST /api/tailor-stream` SSE endpoint: validation, progress events, complete/error events, PDF failure handling

**Infrastructure tests:**
- `test_middleware.py` — Request ID generation, exception handler responses

---

## Mocking Patterns

### Pattern 1: Mocking LLM Client + Langfuse

Used in `test_services.py` for testing LLM-dependent services:

```python
mock_llm = AsyncMock()
mock_llm.call_json = AsyncMock(return_value={
    "languages": ["Python", "Go"],
    "backend": ["Django", "FastAPI"],
    # ... full expected response
})

with patch("app.services.extractor.get_llm_client", return_value=mock_llm), \
     patch("app.services.extractor.get_prompt_messages", return_value=(
         "system prompt", "user prompt", {"temperature": 0.1}
     )):
    result = await extract_keywords("A long job description...", "Backend Engineer")

assert isinstance(result, ExtractedKeywords)
```

**Why two patches?** Each service calls two external dependencies:
1. `get_prompt_messages()` — fetches prompt from Langfuse
2. `get_llm_client()` — creates the LLM client that makes API calls

Both must be mocked to avoid real API calls in tests.

### Pattern 2: Testing Fallback Prompts

Verify that services work when Langfuse is down:

```python
with patch("app.services.extractor.get_llm_client", return_value=mock_llm), \
     patch("app.services.extractor.get_prompt_messages", return_value=None):
    result = await extract_keywords("Some JD text...", "Engineer")

assert result is not None           # didn't fail
mock_llm.call_json.assert_called_once()  # LLM was still called (with fallback prompt)
```

**Key assertion:** When `get_prompt_messages` returns `None`, the service should NOT return `None` — it should use the fallback prompt and call the LLM.

### Pattern 3: Testing Endpoint with TestClient

Used in `test_endpoint.py` and `test_middleware.py`:

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
resp = client.get("/api/health")
assert resp.status_code == 200
assert "X-Request-ID" in resp.headers
```

`TestClient` is synchronous (no `await`) and runs the full middleware stack.

---

## Rate Limiter in Tests

**File:** `backend/tests/conftest.py`

Rate limiting is disabled for all tests via an autouse fixture:

```python
@pytest.fixture(autouse=True)
def _disable_rate_limiter():
    app.state.limiter.enabled = False
    tailor_route.limiter.enabled = False
    yield
    app.state.limiter.enabled = True
    tailor_route.limiter.enabled = True
```

**Why autouse?** Every test needs this — without it, tests that hit the same endpoint multiple times would get 429 responses.

---

## Coverage

### Configuration

**File:** `backend/pyproject.toml`

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.coverage.run]
source = ["app"]

[tool.coverage.report]
fail_under = 70
show_missing = true
```

### Running Coverage

```bash
# With Makefile
make test-cov

# Directly
cd backend && pytest --cov=app --cov-report=term-missing --cov-fail-under=70
```

### Coverage Breakdown

| Module | Coverage | Notes |
|--------|----------|-------|
| `middleware.py` | 100% | Fully tested via TestClient |
| `models.py` | 100% | Exercised by all service tests |
| `latex/parser.py` | 100% | Comprehensive marker tests |
| `latex/writer.py` | 100% | Injection + writing tests |
| `services/matcher.py` | 100% | All paths including edge cases |
| `services/reorderer.py` | 100% | Deterministic, fully testable |
| `routes/tailor.py` | 96% | Mocked integration tests |
| `core/llm.py` | 23% | External API client — mocked in tests |
| `core/langfuse_client.py` | 17% | External API client — mocked in tests |
| `services/compiler.py` | 27% | Requires pdflatex binary |

**Why ~73% and not 90%+?** The uncovered code is primarily external API client implementations (`llm.py`, `langfuse_client.py`) and the LaTeX compiler (`compiler.py` — requires pdflatex binary). These are tested indirectly by mocking their interfaces, which is the correct pattern for external dependencies.

---

## Frontend Tests

**Framework:** Vitest + React Testing Library + @testing-library/user-event + jsdom

```
frontend/src/
├── lib/
│   └── utils.test.ts                    # cn(), formatDuration(), CATEGORY_LABELS
└── components/__tests__/
    ├── match-score.test.tsx             # SVG ring rendering, color thresholds, ARIA
    ├── keyword-chips.test.tsx           # Chip groups, empty states, category labels
    ├── diff-view.test.tsx              # Expand/collapse, aria-expanded, line coloring
    ├── error-boundary.test.tsx          # Error fallback UI, Try Again recovery
    └── reorder-info.test.tsx            # Skills/project order, summary truncation
```

### Running

```bash
cd frontend && npx vitest run     # single run (39 tests)
cd frontend && npx vitest         # watch mode
```

Tests cover:
- **Component rendering** — correct text, structure, and props
- **User interactions** — click to expand/collapse (userEvent), Try Again recovery
- **Accessibility** — `role`, `aria-label`, `aria-expanded`, `aria-hidden`
- **Edge cases** — empty data, zero score, long summary truncation
- **Utility functions** — class merging, duration formatting, label mapping
