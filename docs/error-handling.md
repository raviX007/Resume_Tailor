# Error Handling

## Overview

Every request gets a unique **request ID** that flows through logs, error responses, and response headers. This enables end-to-end tracing: a user can report a request ID, and you can grep logs to find exactly what happened.

---

## Request ID Middleware

**File:** `backend/app/middleware.py`

```python
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        rid = uuid.uuid4().hex[:8]       # 8-char hex: e.g., "b4de6ae7"
        request_id_var.set(rid)           # available to all code in this request
        request.state.request_id = rid    # available to route handlers
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response
```

**How it works:**

1. **Generation:** Every incoming request gets an 8-character hex UUID (e.g., `b4de6ae7`)
2. **Storage:** The ID is stored in a `contextvars.ContextVar` — this is async-safe and automatically scoped to the current request, even with concurrent requests
3. **Propagation:** The ID is set on both `request.state` (for route handlers) and the context var (for services/logger)
4. **Response:** The `X-Request-ID` header is added to every response, including errors

**Why `contextvars`?** Unlike thread-local storage, `ContextVar` works correctly with Python's `asyncio` — each coroutine gets its own copy of the variable, so concurrent requests never see each other's IDs.

---

## Logger Integration

**File:** `backend/app/core/logger.py`

Both formatters include the request ID automatically:

**JSON formatter** (for production/log aggregation):
```json
{
  "timestamp": "2026-02-18T17:57:53.123456+00:00",
  "level": "INFO",
  "logger": "resume-tailor",
  "message": "Match: 4/6 keywords (66%)",
  "module": "matcher",
  "function": "match_keywords",
  "line": 87,
  "request_id": "b4de6ae7"
}
```

**Console formatter** (for development):
```
17:57:53 [INFO    ] resume-tailor [b4de6ae7]: Match: 4/6 keywords (66%)
```

The logger reads `request_id_var.get("-")` — the default `"-"` is used for log lines outside a request context (e.g., startup).

---

## Global Exception Handlers

**File:** `backend/app/main.py`

Two handlers catch all unhandled exceptions and return structured JSON with the request ID:

### HTTPException Handler

Catches all Starlette/FastAPI HTTP exceptions (400, 404, 422, etc.):

```python
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    rid = request_id_var.get("-")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "request_id": rid},
    )
```

**Example response (404):**
```json
{
  "detail": "Not Found",
  "request_id": "25f5808d"
}
```

### Unhandled Exception Handler

Catches everything else — unexpected errors that would otherwise return a bare 500:

```python
@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    rid = request_id_var.get("-")
    logger.error(f"Unhandled exception [{rid}]: {exc}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "request_id": rid},
    )
```

**Key:** The full traceback is logged server-side but **never exposed to the client**. The client only sees `"Internal server error"` + the request ID for support reference.

### Why `starlette.exceptions.HTTPException`?

The handler imports from `starlette.exceptions` (not `fastapi`):

```python
from starlette.exceptions import HTTPException
```

This is important because FastAPI's internal router raises `starlette.exceptions.HTTPException` for 404s on unknown routes. If we registered the handler for `fastapi.HTTPException` (a subclass), the base class exceptions wouldn't be caught.

---

## Error Response Format

All error responses follow the same structure:

```json
{
  "detail": "Human-readable error message",
  "request_id": "8-char hex ID"
}
```

| Status | Source | Example `detail` |
|--------|--------|------------------|
| 400 | Route validation | `"No .tex file uploaded"` |
| 404 | Unknown route | `"Not Found"` |
| 413 | Upload size check | `"File too large (max 2MB)"` |
| 422 | Pydantic validation | `"value is not a valid string"` |
| 429 | Rate limiter | `"Rate limit exceeded"` |
| 500 | Unhandled exception | `"Internal server error"` |

---

## CORS: Exposing the Request ID

The CORS middleware includes `expose_headers` so the frontend JavaScript can read the `X-Request-ID` header:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],   # ← required for frontend access
)
```

Without `expose_headers`, browsers would block JavaScript from reading custom response headers due to the CORS spec.

---

## Middleware Order

Starlette processes middleware in **reverse registration order** (last added = first executed):

```python
# Registration order in main.py:
app.add_middleware(CORSMiddleware, ...)     # registered first
app.add_middleware(RequestIdMiddleware)      # registered second

# Execution order (incoming request):
# 1. RequestIdMiddleware  ← sets request_id
# 2. CORSMiddleware       ← adds CORS headers
# 3. Route handler        ← processes request
```

This ensures the request ID is available before any other middleware or handler runs.
