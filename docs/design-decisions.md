# Design Decisions

Why things are built the way they are. Each section explains a pattern used in the codebase, the alternatives considered, and why this approach was chosen.

---

## 1. Pure ASGI Middleware vs BaseHTTPMiddleware

**File:** `backend/app/middleware.py`

**What we do:** Implement `RequestIdMiddleware` as a raw ASGI callable instead of using Starlette's `BaseHTTPMiddleware`.

**The simpler alternative:**
```python
# This is what most tutorials show
class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        rid = uuid.uuid4().hex[:8]
        response = await call_next(request)  # <-- problem here
        response.headers["X-Request-ID"] = rid
        return response
```

**Why we don't use it:** `BaseHTTPMiddleware` calls `await call_next(request)`, which internally reads the entire response body into memory before returning. For a normal JSON response this is fine. But for our SSE endpoint (`/api/tailor-stream`), the response is a `StreamingResponse` that yields events over 15-20 seconds. `BaseHTTPMiddleware` would **buffer the entire stream** and only send it to the client after the last event — defeating the purpose of streaming.

**What we do instead:**
```python
class RequestIdMiddleware:
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        rid = uuid.uuid4().hex[:8]
        request_id_var.set(rid)

        async def send_with_rid(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.append("X-Request-ID", rid)
            await send(message)

        await self.app(scope, receive, send_with_rid)
```

Pure ASGI wraps the `send` callable — it intercepts each response chunk as it flows through, injects the header on the first chunk, and passes everything else straight to the client. No buffering.

**Interview answer:** "We use pure ASGI middleware instead of BaseHTTPMiddleware because BaseHTTPMiddleware buffers the entire response body before returning it. This breaks Server-Sent Events, where the whole point is sending data incrementally. The pure ASGI approach wraps the `send` callable so each chunk flows through immediately."

---

## 2. asyncio.Queue Bridge for SSE

**File:** `backend/app/routes/tailor.py`

**The problem:** FastAPI's `StreamingResponse` expects an `async generator` that yields strings. But our pipeline is imperative code — a sequence of `await service_call()` steps. We can't just turn the pipeline into a generator because each step builds on the previous step's result.

**The naive approach (doesn't work):**
```python
async def event_generator():
    analysis = await analyze_resume(tex)  # Step 0
    yield sse_event("progress", {"step": 0})
    keywords = await extract_keywords(jd)  # Step 1
    yield sse_event("progress", {"step": 1})
    # ... but what about asyncio.gather for parallel steps?
    # ... and how do we handle errors mid-stream?
```

This breaks down because: (a) steps 0 and 1 run in parallel via `asyncio.gather`, so you can't yield between them naturally, and (b) if step 3 fails, you need to emit an error event and stop — but the generator is the one yielding, not the pipeline.

**What we do instead — Queue bridge:**
```python
async def event_generator():
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def on_step(index, label):
        await queue.put(sse_event("progress", {"step": index, "label": label}))

    async def run_pipeline():
        try:
            result = await _execute_pipeline(..., on_step=on_step)
            await queue.put(sse_event("complete", result.model_dump()))
        except PipelineError as e:
            await queue.put(sse_event("error", {"detail": e.detail, "step": e.step}))
        finally:
            await queue.put(None)  # sentinel: "I'm done"

    task = asyncio.create_task(run_pipeline())
    while True:
        event = await asyncio.wait_for(queue.get(), timeout=1.0)
        if event is None:
            break
        yield event
```

The pipeline runs as a separate `asyncio.Task` and pushes events into a queue. The generator just pulls from the queue and yields. `None` is a sentinel value meaning "stream is done."

**Why the 1-second timeout?** Without it, if the client disconnects, `queue.get()` would block forever. The timeout lets us periodically check `request.is_disconnected()` and cancel the pipeline task if the client left.

**Interview answer:** "The pipeline is imperative code — step 2 needs step 1's output, etc. We can't turn it into a generator. So we use an asyncio.Queue as a bridge: the pipeline runs as a background task and pushes SSE events into the queue, while the generator pulls from it. A `None` sentinel signals the end. This cleanly separates pipeline logic from streaming mechanics."

---

## 3. contextvars for Request ID (not function parameters)

**File:** `backend/app/middleware.py`, `backend/app/core/logger.py`

**The alternative:** Pass `request_id` as a parameter through every function call:
```python
# This would be tedious and invasive
async def analyze_resume(tex, request_id):
    result = await llm_call(prompt, request_id)
    logger.info(f"[{request_id}] Analysis complete")
```

**Why we don't:** The request ID needs to appear in logs from middleware, routes, services, LLM calls — 6+ layers deep. Threading it as a parameter would mean modifying every function signature in the call chain.

**What we do instead:**
```python
# Set once in middleware
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
request_id_var.set(rid)

# Read anywhere — logger automatically includes it
class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id_var.get()
        return True
```

`ContextVar` is Python's async-safe equivalent of thread-local storage. Each concurrent request gets its own value, automatically. The logger filter reads it, so every log line includes the request ID without any code changes in services.

**Interview answer:** "We use Python's `contextvars.ContextVar` to store the request ID. It's set once in middleware and automatically scoped to each async request — like thread-local storage but for asyncio. The logger reads it via a filter, so every log line gets the request ID without passing it through function parameters. This keeps service code clean and decoupled from request tracking."

---

## 4. Parallel Steps 0+1, Sequential 2-5

**File:** `backend/app/routes/tailor.py`

**The pipeline:**
```
Step 0: Analyze resume .tex     (LLM, ~5s)  ─┐
Step 1: Extract JD keywords     (LLM, ~3s)  ─┤ parallel
                                              ─┘
Step 2: Match keywords vs skills (LLM, ~4s)  ← needs both 0 and 1
Step 3: Compute reorder plan     (instant)   ← needs 2
Step 4: Inject into LaTeX        (instant)   ← needs 3 + 0
Step 5: Compile PDF              (~2s)       ← needs 4
```

**Why only 0+1 in parallel?** Steps 0 and 1 analyze different documents (resume vs JD) with no data dependency. Step 2 needs results from both, so it must wait. Steps 3-5 are a strict chain where each needs the previous output.

**Implementation:**
```python
analysis, extracted = await asyncio.gather(
    analyze_uploaded_resume(raw_tex),    # Step 0
    extract_keywords(jd_text, job_title), # Step 1
)
# Step 2 onwards: sequential
match = await match_keywords(analysis.skills, extracted)
plan = compute_reorder_plan(extracted, match, sections)  # no await — deterministic
```

**Impact:** Steps 0+1 take ~5s instead of ~8s (the longer one dominates). Total pipeline goes from ~19s to ~14s.

**Why not parallelize more?** Steps 3 and 4 are deterministic Python (no I/O), so they complete in milliseconds — parallelizing them would add complexity for zero benefit. Step 5 (pdflatex) depends on Step 4's output.

**Interview answer:** "Steps 0 and 1 analyze different documents — the resume and the JD — so they have no data dependency and run in parallel with `asyncio.gather`. This saves ~3 seconds. Steps 2-5 form a dependency chain where each needs the previous step's output, so they run sequentially. Steps 3-4 are deterministic Python that complete in milliseconds, so parallelizing them would add complexity for no gain."

---

## 5. LLM Fallback: Why 5 Failures Before Switching

**File:** `backend/app/core/llm.py`

**The mechanism:** OpenAI is primary, Gemini is fallback. After 5 consecutive OpenAI failures, all subsequent calls go to Gemini until either one succeeds (which resets the counter).

**Why not fail over immediately?**
- A single API timeout doesn't mean OpenAI is down — it could be a transient network blip
- Switching providers mid-pipeline would give inconsistent results (different LLMs format JSON differently)
- Each request already has retry logic (2 attempts with exponential backoff via `tenacity`)

**Why 5 specifically?** One pipeline makes 3 LLM calls (analyze, extract, match). If an entire pipeline fails (3 calls), plus 2 more individual failures, that's strong evidence of a persistent outage — not just transient errors.

**The recovery mechanism:**
```python
# On OpenAI success → reset counter
self.openai_failures = 0

# On Gemini success → also reset counter
self.openai_failures = 0
```

A successful Gemini call resets the OpenAI counter so the next request tries OpenAI first again. This means Gemini is only used during the outage window, not permanently.

**Interview answer:** "We use a counter-based fallback: after 5 consecutive OpenAI failures, we switch to Gemini. Why 5? Each request makes 3 LLM calls, so one full failed request plus 2 more failures confirms it's a real outage, not a transient blip. Individual calls already retry twice with exponential backoff. When either provider succeeds, the counter resets so we try OpenAI first on the next request."

---

## 6. Marker-Based LaTeX vs AST Parsing

**File:** `backend/app/latex/parser.py`, `backend/app/services/resume_analyzer.py`

**The problem:** We need to reorder sections in a LaTeX file — move the "backend" skills line above "languages", reorder projects by relevance. But LaTeX is a Turing-complete language with no standard AST parser in Python.

**Alternative: LaTeX AST parsing (e.g., TexSoup, pylatexenc)**
- These tools parse LaTeX into a tree, but they struggle with custom macros, non-standard templates, and the infinite variety of resume formats
- They break on things like `\newcommand` redefinitions, custom environments, and raw TeX

**What we do instead:** The LLM (Step 0) inserts comment markers into the .tex:
```latex
% SKILLS_START
% SKILL_CAT:languages
\skillline{Languages}{Python, JavaScript} \\
% SKILL_CAT:backend
\skillline{Backend}{Django, FastAPI} \\
% SKILLS_END
```

Then the parser uses simple regex to extract content between markers:
```python
pattern = re.compile(
    rf"^{re.escape(start_marker)}\s*$\n(.*?)^{re.escape(end_marker)}\s*$",
    re.DOTALL | re.MULTILINE,
)
```

**Why this works:**
1. LaTeX comments (`%`) are completely ignored by the compiler — they don't affect the PDF output
2. The LLM understands LaTeX structure better than any rule-based parser — it can identify sections regardless of formatting
3. Regex on comment markers is fast, reliable, and never breaks the LaTeX
4. The markers are deterministic anchors — Steps 3-5 can safely manipulate content between them

**Interview answer:** "LaTeX is Turing-complete — there's no reliable AST parser for arbitrary resume templates. Instead, we use the LLM to insert comment markers (`% SKILLS_START`, `% PROJECT:name`) into the .tex file. Since LaTeX comments don't affect PDF output, this gives us safe, parseable anchors. Then simple regex extracts content between markers. The LLM handles the hard part (understanding diverse resume formats), and deterministic code handles the manipulation."

---

## 7. Pydantic Settings for Configuration

**File:** `backend/app/config.py`

**The alternative:** Read env vars directly:
```python
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
```

**Why Pydantic Settings instead:**
```python
class Settings(BaseSettings):
    openai_api_key: str = ""
    allowed_origins: str = "http://localhost:3000"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )
```

1. **Type validation at startup** — If you set `LOG_LEVEL=123` and the field expects `str`, you'd know immediately (and with stricter types, Pydantic rejects invalid values before any request is served)
2. **Single source of truth** — All config in one class, not scattered across files
3. **`.env` file support built in** — No need for `python-dotenv` load calls
4. **Testability** — You can instantiate `Settings(openai_api_key="test")` in tests without touching env vars
5. **IDE support** — Type hints on settings mean autocomplete works: `settings.openai_api_key`

The singleton pattern (`load_settings()`) ensures the `.env` file is only read once.

**Interview answer:** "We use Pydantic Settings instead of raw `os.getenv` because it gives us type validation at startup, a single source of truth for all config, built-in `.env` file loading, and testability — you can construct a `Settings` object with test values without touching environment variables. It's loaded once as a singleton."

---

## 8. Rate Limiter Auto-Disable in Tests

**File:** `backend/tests/conftest.py`

**The problem:** The API has a 10 req/min rate limit. Tests make dozens of requests in seconds. Without disabling the limiter, tests would randomly fail with 429 errors.

**Bad alternative:** Remove the rate limiter decorator in test mode:
```python
# Don't do this — conditional decorators are fragile
if not TESTING:
    @limiter.limit("10/minute")
```

**What we do:** Use a pytest `autouse` fixture that disables the limiter for every test:
```python
@pytest.fixture(autouse=True)
def _disable_rate_limiter():
    app.state.limiter.enabled = False
    yield
    app.state.limiter.enabled = True  # re-enable after test
```

`autouse=True` means it runs for every test without being explicitly referenced. The `yield` pattern ensures cleanup happens even if the test fails.

**Why this is better:**
- Production code has no test-mode conditionals
- The rate limiter is fully tested in `test_middleware.py` (which re-enables it for specific tests)
- No risk of accidentally shipping with the limiter disabled

**Interview answer:** "We use a pytest `autouse` fixture that disables the rate limiter before each test and re-enables it after. This avoids polluting production code with test-mode conditionals. The fixture uses `yield` for guaranteed cleanup. We separately test that the rate limiter works correctly in dedicated middleware tests where we re-enable it."

---

## 9. PipelineError vs HTTPException

**File:** `backend/app/routes/tailor.py`

**The problem:** The pipeline has two callers: the JSON endpoint (`/api/tailor`) and the SSE endpoint (`/api/tailor-stream`). When step 2 fails:
- JSON endpoint should raise `HTTPException(500, "Matching failed")`
- SSE endpoint should emit `event: error\ndata: {"detail": "Matching failed", "step": 2}`

If the pipeline raises `HTTPException` directly, the SSE endpoint can't convert it to an SSE event — FastAPI would intercept it and send a normal error response, breaking the stream.

**Solution:** Custom exception that carries step info:
```python
class PipelineError(Exception):
    def __init__(self, status_code: int, detail: str, step: int):
        self.status_code = status_code
        self.detail = detail
        self.step = step
```

Each endpoint catches it differently:
```python
# JSON endpoint
try:
    return await _execute_pipeline(...)
except PipelineError as e:
    raise HTTPException(status_code=e.status_code, detail=e.detail)

# SSE endpoint
try:
    result = await _execute_pipeline(...)
    await queue.put(sse_event("complete", result.model_dump()))
except PipelineError as e:
    await queue.put(sse_event("error", {"detail": e.detail, "step": e.step}))
```

**Interview answer:** "The pipeline is shared between the JSON and SSE endpoints, but they handle errors differently — JSON raises HTTPException, SSE emits an error event. So the pipeline raises a custom `PipelineError` with the step index and message. Each endpoint catches it and translates it to the appropriate error format. This keeps pipeline logic decoupled from transport concerns."

---

## 10. Why `fetch()` + ReadableStream, Not EventSource

**File:** `frontend/src/lib/api.ts`

**The standard SSE approach:**
```javascript
const source = new EventSource("/api/tailor-stream");
source.onmessage = (event) => { ... };
```

**Why we can't use it:** `EventSource` only supports GET requests. Our endpoint needs POST with `multipart/form-data` (file upload + JD text). There's no way to send a request body with `EventSource`.

**What we do instead:**
```typescript
const response = await fetch("/api/tailor-stream", {
    method: "POST",
    body: formData,
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";  // keep incomplete event

    for (const part of parts) {
        // parse "event: " and "data: " lines
    }
}
```

We manually parse the SSE format (`event: type\ndata: json\n\n`) from the raw byte stream. The buffer handles the case where an event is split across two chunks.

**Interview answer:** "We use `fetch()` with `ReadableStream` instead of the browser's `EventSource` API because `EventSource` only supports GET requests. Our endpoint requires POST with multipart form data for the file upload. So we manually consume the response body as a stream and parse the SSE format ourselves — splitting on double newlines and extracting `event:` and `data:` fields."

---

## Quick Reference

| Decision | Pattern | Why Not the Alternative |
|----------|---------|------------------------|
| Middleware | Pure ASGI | BaseHTTPMiddleware buffers StreamingResponse |
| SSE bridge | asyncio.Queue + Task | Pipeline is imperative, can't be a generator |
| Request ID | contextvars | Avoids threading ID through every function |
| Parallel steps | gather for 0+1 only | Steps 2-5 have data dependencies |
| LLM fallback | 5-failure threshold | Avoids switching on transient errors |
| LaTeX parsing | Comment markers + regex | No reliable LaTeX AST parser exists |
| Configuration | Pydantic Settings | Type validation, single source of truth |
| Test isolation | autouse fixture | No test-mode conditionals in production |
| Pipeline errors | Custom PipelineError | HTTPException can't be caught in SSE stream |
| Frontend SSE | fetch + ReadableStream | EventSource is GET-only, we need POST |
