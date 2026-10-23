# PDF Chatter — Full-Stack RAG Document Q&A

**React · FastAPI · Gemini · Pinecone · Python**

Upload PDFs and ask questions in natural language. Answers are grounded in your documents and
cite the exact **document and page** they came from.

## Highlights
- **Retrieval-augmented generation**: PDF text extraction → recursive, boundary-aware chunking → Gemini embeddings → Pinecone vector retrieval → grounded Gemini answers with `[n]` citations.
- **Multi-document querying**: choose which documents are in scope for every question.
- **Citations you can verify**: clickable `[n]` chips jump to source cards showing document, page, similarity and the retrieved passage.
- **Streaming answers** with Stop / Regenerate / Copy, Markdown + table rendering.
- **Document management**: upload (drag & drop, multi-file), select, delete, persistent metadata per browser session.
- **Robust API**: input validation, size limits, PDF sanity checks, per-session isolation, friendly error messages.
- **Professional UI**: custom responsive design system, light/dark themes, mobile drawer, keyboard accessible.

## Architecture
```
frontend/            React + Vite SPA (custom CSS, no UI framework)
  src/api.js           API client + NDJSON stream reader
  src/App.jsx          state: documents, selection, chat, streaming
  src/components/      Sidebar, UploadZone, DocumentList, Message, SourceCard, Composer, ...
app/                 FastAPI backend
  main.py              routes + serves the built frontend
  rag.py               ingest (PDF -> chunks -> embeddings) and retrieve + answer
  gemini.py            Gemini embeddings + streaming generation (google-genai SDK)
  store.py             PineconeStore / LocalStore + document registry
  pdf.py, chunking.py, config.py
tests/               pytest suite (fake LLM, no API key needed)
```

## Quick start
You need **Python 3.10+** and **Node 18+**, plus a Gemini key ([get one](https://aistudio.google.com/apikey))
and (recommended) a Pinecone key ([get one](https://app.pinecone.io)).

```bash
# 1) Backend
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # add GOOGLE_API_KEY (and PINECONE_API_KEY)
uvicorn app.main:app --reload --port 8000

# 2) Frontend (new terminal) — development with hot reload
cd frontend
npm install
npm run dev                  # open http://localhost:5173  (proxies /api to :8000)
```

**Single-server mode** (what production uses): `cd frontend && npm run build`, then just run the
backend and open http://localhost:8000 — FastAPI serves the built React app.

## Configuration (`.env`)
| Variable | Default | Notes |
|---|---|---|
| `GOOGLE_API_KEY` | – | required |
| `GEMINI_MODEL` | `gemini-2.5-flash` | any Gemini chat model |
| `EMBEDDING_MODEL` | `gemini-embedding-001` | 768-dim output |
| `PINECONE_API_KEY` | empty | set to use Pinecone; empty falls back to a local store |
| `PINECONE_INDEX` | `chat-pdf` | auto-created (serverless, 768 dims, cosine) |
| `PINECONE_CLOUD` / `PINECONE_REGION` | `aws` / `us-east-1` | serverless spec |
| `DATA_DIR` | `./data` | document metadata (+ local vectors) |
| `MAX_UPLOAD_MB` | `25` | per file |
| `TOP_K` | `6` | chunks retrieved per question |
| `CORS_ORIGINS` | `http://localhost:5173` | only needed if the frontend is hosted separately |

## API
All `/api/documents*` and `/api/chat` calls require an `X-Session-Id` header (the frontend generates one). Interactive docs at `/docs`.
- `GET  /api/health`
- `POST /api/documents` — multipart `files`
- `GET  /api/documents` · `DELETE /api/documents/{id}`
- `POST /api/chat` — `{question, doc_ids, history}` → NDJSON stream of `sources`, `token`, `done` / `error`

## Deploy
```bash
docker build -t pdf-chatter .
docker run -p 8000:8000 -e GOOGLE_API_KEY=... -e PINECONE_API_KEY=... -v pdfchatter-data:/data pdf-chatter
```
The Dockerfile builds the React app and bundles it into the FastAPI image. On Render / Railway / Fly.io,
deploy from the Dockerfile, set the env vars, and attach a persistent disk at `/data` (document metadata lives there).

## Tests
```bash
pip install -r requirements-dev.txt && pytest
```

## Notes
- Scanned / image-only PDFs have no text layer and are rejected with a clear message (no OCR).
- Documents are scoped per browser session and per document via metadata filters (Pinecone) or per-session folders (local).
