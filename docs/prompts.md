# Prompt Management

## Overview

All three LLM prompts are managed in [Langfuse](https://cloud.langfuse.com) — a prompt management and observability platform. Prompts are fetched at runtime, cached for 5 minutes, and traced for monitoring. Embedded fallback prompts provide resilience when Langfuse is unavailable.

```
┌──────────────────────────────────────────────────────────┐
│                    Prompt Lifecycle                        │
│                                                            │
│  Edit in Langfuse UI → Push via scripts/push_prompts.py   │
│                             │                              │
│  Runtime: get_prompt_messages() ← 300s cache               │
│                             │                              │
│  Langfuse down? → fallback_prompts.py (embedded copies)    │
│                             │                              │
│  LLM call → Langfuse traces (input, output, latency)       │
└──────────────────────────────────────────────────────────┘
```

---

## The Three Prompts

| Prompt Name | Used In | Purpose | LLM Config |
|-------------|---------|---------|------------|
| `resume-tailor-analyze` | `resume_analyzer.py` | Insert comment markers into .tex + extract all technical skills | temp=0.1, max_tokens=8000 |
| `resume-tailor-extract` | `extractor.py` | Parse job description into structured keyword categories | temp=0.1, max_tokens=1000 |
| `resume-tailor-match` | `matcher.py` | Semantically match JD keywords against resume skills | temp=0.1, max_tokens=2000 |

### resume-tailor-analyze (Step 0)

**Input:** Raw `.tex` file content
**Output:** JSON with `marked_tex`, `skills`, `sections_found`, `person_name`

This is the most complex prompt. It must:
1. Parse arbitrary LaTeX formats (article, moderncv, awesome-cv)
2. Insert comment markers without modifying existing content
3. Convert skill lines to standardized `\skillline{}{}` format
4. Extract skills from the entire document (not just the skills section)
5. Map resume categories to standard keys (languages, backend, frontend, ai_llm, databases, devops)

### resume-tailor-extract (Step 1)

**Input:** Job description text + optional job title
**Output:** JSON with keyword arrays per category + `role_title` + `experience_level`

Key prompt features:
- Normalization rules (React/ReactJS → React.js, Postgres → PostgreSQL)
- Category specificity (LangChain → ai_llm, not backend)
- Extracts from "nice to have" and "bonus" sections too
- Few-shot example included

### resume-tailor-match (Step 2)

**Input:** JD keywords + all known resume skills + skills currently on resume
**Output:** JSON with `matched`, `missing_from_resume`, `injectable`

Key prompt features:
- Semantic matching (container orchestration ≈ Kubernetes)
- Alias matching (React = React.js = ReactJS)
- Uses the resume's skill name in output (not the JD's variant)
- Distinguishes injectable (candidate knows it, not on current resume) from missing (doesn't know it)

---

## Runtime: Fetching Prompts

**File:** `backend/app/core/langfuse_client.py`

```python
def get_prompt_messages(prompt_name: str, template_vars: dict) -> tuple | None:
    """Fetch a prompt from Langfuse and render with template variables.

    Returns:
        (system_prompt, user_prompt, config) on success
        None on any failure (network, auth, missing prompt)
    """
```

**Cache behavior:**
- First call for a prompt name: fetches from Langfuse API
- Subsequent calls within 300s: returns cached version
- After 300s: re-fetches from Langfuse
- If re-fetch fails: cache expires, returns None → triggers fallback

**Template variables** use Langfuse's `{{variable}}` syntax in the stored prompt. At runtime, they're replaced with actual values:
- `{{jd_text}}` → the job description text
- `{{job_title}}` → optional job title
- `{{tex_content}}` → the LaTeX file content
- `{{jd_keywords}}` → formatted JD keywords
- `{{resume_skills}}` → formatted resume skills
- `{{skills_on_resume}}` → formatted current skills on resume

---

## Fallback Prompts

**File:** `backend/app/core/fallback_prompts.py`

When Langfuse is unavailable, each service falls back to embedded prompt copies:

```python
FALLBACK_PROMPTS = {
    "resume-tailor-extract": {
        "system": "You are a technical keyword extraction engine...",
        "user": "Extract technical keywords from...\n\n{jd_text}\n\n...",
        "config": {"temperature": 0.1, "max_tokens": 1000},
    },
    "resume-tailor-analyze": { ... },
    "resume-tailor-match": { ... },
}
```

**Important differences from Langfuse prompts:**
- Fallback prompts use Python `str.format()` syntax (`{variable}`) not Langfuse's `{{variable}}`
- Fallback prompts are condensed — they preserve critical instructions but are shorter than the full Langfuse versions
- Config is included directly (not fetched from Langfuse)

### Updating Fallback Prompts

When you significantly change a Langfuse prompt:
1. Edit the prompt in Langfuse UI
2. Push it via `python scripts/push_prompts.py` (optional — for version tracking)
3. Update the corresponding entry in `fallback_prompts.py` if the changes are significant

Minor prompt tweaks (rephrasing, adding examples) don't need fallback updates. Only update fallbacks when the output format or critical instructions change.

---

## Pushing Prompts

**File:** `backend/scripts/push_prompts.py`

```bash
cd backend
python scripts/push_prompts.py
```

This script:
1. Reads the full prompt text from Python constants in the script
2. Creates new versions in Langfuse with the `production` label
3. Preserves old versions (Langfuse versioning)

The script contains the **canonical, full-length versions** of all prompts with:
- Detailed step-by-step instructions
- Few-shot examples
- Normalization rules
- Self-check checklists
- Common mistakes to avoid

These are more detailed than the fallback prompts.

---

## Tracing

All LLM calls are automatically traced in Langfuse via the `@observe` decorator:

```python
from app.core.langfuse_client import observe

@observe(name="resume-tailor-extract")
async def extract_keywords(jd_text: str, job_title: str = "") -> ExtractedKeywords | None:
    ...
```

Each trace includes:
- **Input:** The template variables passed to the prompt
- **Output:** The LLM's response
- **Latency:** Time taken for the LLM call
- **Token usage:** Input and output token counts
- **Success/failure:** Whether the call succeeded
- **Model:** Which model was used (GPT-4o-mini or Gemini fallback)

View traces at: `https://cloud.langfuse.com` → Traces → filter by trace name.
