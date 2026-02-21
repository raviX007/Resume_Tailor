# Resilience

## Overview

The Resume Tailor pipeline has three external dependencies that can fail: **Langfuse** (prompt management), **OpenAI** (primary LLM), and **Google Gemini** (fallback LLM). The system is designed to degrade gracefully at each layer.

```
Langfuse prompts  →  Embedded fallback prompts
OpenAI GPT-4o-mini →  Google Gemini 2.0-flash
Pipeline step fails →  Graceful error with request_id
```

---

## Fallback Prompts

**File:** `backend/app/core/fallback_prompts.py`

When Langfuse is unreachable, the three LLM services fall back to **embedded copies of the prompts** instead of failing immediately.

### How It Works

Each service (extractor, analyzer, matcher) follows this pattern:

```python
langfuse_result = get_prompt_messages("resume-tailor-extract", template_vars)

if langfuse_result:
    # Happy path: Langfuse returned the prompt
    system_prompt, user_prompt, config = langfuse_result
    config = config or default_config
else:
    # Fallback: use embedded prompt
    from app.core.fallback_prompts import FALLBACK_PROMPTS
    fb = FALLBACK_PROMPTS["resume-tailor-extract"]
    system_prompt = fb["system"]
    user_prompt = fb["user"].format(**template_vars)
    config = fb["config"]
    logger.warning("Langfuse unavailable — using embedded fallback for resume-tailor-extract")
```

### Before vs After

**Before (fragile):**
```
Langfuse down → get_prompt_messages() returns None → service returns None → pipeline fails
```

**After (resilient):**
```
Langfuse down → get_prompt_messages() returns None → use embedded fallback → pipeline continues
```

### Fallback Prompt Structure

```python
FALLBACK_PROMPTS = {
    "resume-tailor-extract": {
        "system": "You are a technical keyword extraction engine...",
        "user": "Extract technical keywords from this job description:\n\n{jd_text}\n\n...",
        "config": {"temperature": 0.1, "max_tokens": 1000, "response_format": "json"},
    },
    "resume-tailor-analyze": { ... },
    "resume-tailor-match": { ... },
}
```

Each entry mirrors what Langfuse returns: system prompt, user prompt (with `{template_var}` placeholders), and config (model parameters).

### Keeping Fallbacks in Sync

The fallback prompts are **condensed versions** of the full Langfuse prompts (from `scripts/push_prompts.py`). They preserve all critical instructions but are shorter. When you significantly change a Langfuse prompt, update the fallback too.

The fallback prompts are a safety net — they don't need to be identical to the Langfuse versions, just functional enough to keep the pipeline working.

---

## LLM Provider Failover

**File:** `backend/app/core/llm.py`

The LLM client has a two-provider failover strategy:

```
Request → OpenAI GPT-4o-mini
              │
              ├─ Success → return result
              │
              └─ Failure (after retries) → switch to Gemini 2.0-flash
                                                │
                                                ├─ Success → return result
                                                │
                                                └─ Failure → return None
```

**Controlled by:**
- `MAX_OPENAI_FAILURES = 5` — After 5 consecutive OpenAI failures, the client switches to Gemini for subsequent calls
- The counter resets on successful OpenAI calls
- All calls are traced in Langfuse for monitoring which provider is being used

---

## Langfuse Client Resilience

**File:** `backend/app/core/langfuse_client.py`

The Langfuse client has its own resilience patterns:

1. **Lazy initialization** — The Langfuse client is only created on first use, not at import time. If Langfuse credentials are missing, the app still starts.

2. **Thread-safe singleton** — Uses a lock to prevent race conditions during initialization in multi-worker setups.

3. **Cache with TTL** — Prompt results are cached for 300 seconds (5 minutes). If Langfuse goes down after startup, cached prompts continue serving for up to 5 minutes.

4. **Graceful None** — `get_prompt_messages()` returns `None` on any error (network, auth, missing prompt) rather than raising exceptions. The calling service decides what to do.

---

## Pipeline-Level Resilience

The `POST /api/tailor` endpoint handles per-step failures:

| Failure | Impact | Behavior |
|---------|--------|----------|
| Step 0 fails (analyze) | Can't parse resume | Return 500 with request_id |
| Step 1 fails (extract) | Can't parse JD | Return 500 with request_id |
| Step 2 fails (match) | Can't match skills | Return 500 with request_id |
| Step 5 fails (compile) | PDF generation fails | Return JSON results without PDF URL (graceful) |
| Upload too large | Rejected early | Return 413 before any LLM calls |
| Invalid .tex content | Detected in Step 0 | Return 400 with descriptive error |

Steps 3 and 4 (reorder + inject) are deterministic Python — they don't have external failure modes.

---

## Monitoring

All LLM calls are traced in Langfuse with:
- **Trace name** matching the prompt name (e.g., `resume-tailor-extract`)
- **Input/output** for debugging prompt effectiveness
- **Latency** and **token usage** for cost monitoring
- **Success/failure** status

When fallback prompts are used, the log line `"Langfuse unavailable — using embedded fallback"` appears with the request ID, making it easy to monitor Langfuse health via log aggregation.
