# Troubleshooting

Common issues and how to fix them.

---

## CORS Errors

**Symptom:** Browser console shows `Access to fetch at 'http://localhost:8001/api/tailor' has been blocked by CORS policy`.

**Cause:** The frontend origin isn't in the backend's `ALLOWED_ORIGINS` list.

**Fix:**
1. Open `backend/.env`
2. Ensure `ALLOWED_ORIGINS` includes your frontend URL:
   ```
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
   ```
3. Restart the backend (`uvicorn app.main:app --port 8001`)

> **Note:** If you're running the frontend on a non-default port (e.g., `3002`), add that port to the comma-separated list.

---

## pdflatex Not Found

**Symptom:** The API returns results (match score, keywords, diff) but `pdf_b64` is empty and no PDF is generated. Backend logs show: `pdflatex not found`.

**Cause:** pdflatex is not installed or not in PATH.

**Fix (macOS):**
```bash
# Option A: BasicTeX (~100 MB, recommended)
brew install --cask basictex

# Restart terminal, then install required packages:
sudo /Library/TeX/texbin/tlmgr update --self
sudo /Library/TeX/texbin/tlmgr install enumitem titlesec
```

**Fix (Ubuntu/Debian):**
```bash
sudo apt-get install texlive-base texlive-latex-extra
```

**Verify:**
```bash
pdflatex --version
# or on macOS with BasicTeX:
/Library/TeX/texbin/pdflatex --version
```

> **Note:** The API still works without pdflatex — you get everything except the PDF download.

---

## Langfuse Connection Failed

**Symptom:** Backend logs show `Failed to fetch prompt from Langfuse` or `Langfuse client initialization failed`.

**Cause:** Langfuse keys are missing, incorrect, or Langfuse is temporarily unavailable.

**This is not a problem.** The app has embedded fallback prompts and continues working normally. You'll see a log warning but the pipeline runs without interruption.

**If you want Langfuse working:**
1. Sign up at [cloud.langfuse.com](https://cloud.langfuse.com)
2. Create a project and get your public + secret keys
3. Add to `backend/.env`:
   ```
   LANGFUSE_PUBLIC_KEY=pk-lf-your-key
   LANGFUSE_SECRET_KEY=sk-lf-your-key
   ```
4. Push prompts: `cd backend && python scripts/push_prompts.py`
5. Restart the backend

---

## OpenAI API Key Issues

**Symptom:** `500 Internal Server Error` on `POST /api/tailor`. Backend logs show `AuthenticationError` or `RateLimitError`.

**Fixes:**
- **Invalid key:** Verify your key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **No credits:** Check your billing at [platform.openai.com/settings/organization/billing](https://platform.openai.com/settings/organization/billing)
- **Rate limited:** Wait a moment and retry. The backend has automatic retry for transient errors.

---

## Frontend Build Errors

**Symptom:** `npm run build` fails with TypeScript or ESLint errors.

**Common causes:**
1. **Missing dependencies:** Run `npm install` again
2. **Node version too old:** Ensure Node.js 20+ (`node --version`)
3. **Type errors:** Check that `src/lib/types.ts` matches the backend response format

**Debug steps:**
```bash
npm run lint     # Check ESLint errors first
npm run build    # Then try the build
npm test         # Verify tests pass
```

---

## Rate Limiting (429 Too Many Requests)

**Symptom:** API returns `429 Too Many Requests` after several rapid requests.

**Cause:** The backend limits to 10 requests per minute per IP address.

**Fix:** Wait 60 seconds and try again. This limit exists because each request makes 3 LLM calls, and rapid requests can exhaust API quotas.

> **In tests:** Rate limiting is automatically disabled via a `conftest.py` fixture — you won't hit this in `pytest`.

---

## File Upload Rejected

**Symptom:** "Invalid file type" or "File too large" error when uploading.

**Checklist:**
- [ ] File extension is `.tex` (not `.txt`, `.pdf`, `.docx`)
- [ ] File size is under 2 MB
- [ ] File is valid UTF-8 encoded text
- [ ] File contains at least 100 characters of content

> **Tip:** If you don't have a `.tex` resume, ask ChatGPT or Claude to convert your existing resume to LaTeX format, or use [Mathpix](https://mathpix.com) to convert a PDF.

---

## Backend Starts but Frontend Can't Connect

**Symptom:** Frontend shows "Network error" or "Failed to fetch".

**Checklist:**
1. Is the backend actually running? `curl http://localhost:8001/api/health`
2. Is the frontend pointing to the right URL? Check `frontend/.env.local`:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:8001
   ```
3. Are CORS origins correct? (See CORS Errors above)
4. Are both services on the same machine? If not, use the machine's IP instead of `localhost`.

---

## Docker Container Unhealthy

**Symptom:** `docker inspect` shows container status as `unhealthy`.

**Debug:**
```bash
# Check container logs
docker logs <container_id>

# Check health check directly
docker exec <container_id> python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/api/health')"
```

**Common causes:**
- Missing environment variables (especially `OPENAI_API_KEY`)
- Port 8001 not exposed (`-p 8001:8001`)
- Container ran out of memory

---

## SSE Progress Not Updating

**Symptom:** Clicking "Tailor Resume" shows the spinner but progress dots don't advance — they all stay gray, or the first dot stays blue the entire time.

**Common causes:**

1. **Backend not restarted after SSE changes:** The frontend calls `/api/tailor-stream` which may not exist if the backend is running old code. Restart:
   ```bash
   make dev-backend
   ```

2. **Reverse proxy buffering:** If behind nginx or a load balancer, SSE responses may be buffered. The backend sends `X-Accel-Buffering: no` but your proxy may override this. Add to nginx config:
   ```
   proxy_buffering off;
   proxy_cache off;
   ```

3. **Stale frontend cache:** Delete `.next` and restart:
   ```bash
   rm -rf frontend/.next && make dev-frontend
   ```

**Verify SSE is working:**
```bash
curl -X POST http://localhost:8001/api/tailor-stream \
  -F "resume_file=@your_resume.tex" \
  -F "jd_text=We are looking for a Backend Developer with Python, Django..." \
  --no-buffer
```

You should see `event: progress` lines appear one at a time as each step completes.
