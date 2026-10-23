import json
from pathlib import Path

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from .config import Settings, get_settings
from .gemini import GeminiClient, LLMNotConfigured
from .pdf import PDFError
from .rag import RAGService
from .store import Registry, make_store, valid_session

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

NO_FRONTEND = """<!doctype html><title>PDF Chatter API</title>
<body style="font-family:system-ui;max-width:560px;margin:15vh auto;padding:0 20px;line-height:1.6">
<h2>PDF Chatter API is running</h2>
<p>The React frontend has not been built yet. Run <code>cd frontend &amp;&amp; npm install &amp;&amp; npm run build</code>,
or start the dev server with <code>npm run dev</code> and open <a href="http://localhost:5173">localhost:5173</a>.</p>
<p>API docs: <a href="/docs">/docs</a></p></body>"""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    doc_ids: list[str] = []
    history: list[ChatMessage] = []


def create_app(settings: Settings | None = None, llm=None, store=None) -> FastAPI:
    s = settings or get_settings()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    llm = llm or GeminiClient(s)
    store = store or make_store(s)
    registry = Registry(s.data_dir)
    rag = RAGService(s, llm, store, registry)

    app = FastAPI(title="PDF Chatter API")
    if s.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=s.cors_origins,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    def sid_of(x_session_id: str | None) -> str:
        if not x_session_id or not valid_session(x_session_id):
            raise HTTPException(400, "Missing or invalid X-Session-Id header.")
        return x_session_id

    @app.get("/api/health")
    def health():
        return {
            "ok": True,
            "gemini_configured": llm.configured,
            "model": s.gemini_model,
            "vector_store": "pinecone" if s.pinecone_api_key else "local",
            "pinecone_index": s.pinecone_index if s.pinecone_api_key else None,
            "max_upload_mb": s.max_upload_mb,
        }

    @app.get("/api/documents")
    def list_documents(x_session_id: str | None = Header(None)):
        return {"documents": registry.list(sid_of(x_session_id))}

    @app.post("/api/documents")
    async def upload(files: list[UploadFile] = File(...), x_session_id: str | None = Header(None)):
        sid = sid_of(x_session_id)
        if not llm.configured:
            raise HTTPException(503, "GOOGLE_API_KEY is not set on the server.")
        results = []
        for f in files:
            name = f.filename or "document.pdf"
            try:
                data = await f.read()
                if len(data) > s.max_upload_mb * 1024 * 1024:
                    raise PDFError(f"File exceeds {s.max_upload_mb} MB limit.")
                if not data.startswith(b"%PDF"):
                    raise PDFError("Not a PDF file.")
                doc = await run_in_threadpool(rag.ingest, sid, name, data)
                results.append({"name": name, "ok": True, "document": doc})
            except PDFError as e:
                results.append({"name": name, "ok": False, "error": str(e)})
            except Exception as e:
                results.append({"name": name, "ok": False, "error": f"Processing failed: {e}"})
        return {"results": results}

    @app.delete("/api/documents/{doc_id}")
    def delete_document(doc_id: str, x_session_id: str | None = Header(None)):
        if not rag.delete(sid_of(x_session_id), doc_id):
            raise HTTPException(404, "Document not found.")
        return {"ok": True}

    @app.post("/api/chat")
    async def chat(req: ChatRequest, x_session_id: str | None = Header(None)):
        sid = sid_of(x_session_id)
        if not llm.configured:
            raise HTTPException(503, "GOOGLE_API_KEY is not set on the server.")

        async def gen():
            try:
                async for kind, payload in rag.answer(
                    sid, req.question, req.doc_ids, [m.model_dump() for m in req.history]
                ):
                    key = "sources" if kind == "sources" else "text"
                    yield json.dumps({"type": kind, key: payload}) + "\n"
                yield json.dumps({"type": "done"}) + "\n"
            except LLMNotConfigured as e:
                yield json.dumps({"type": "error", "message": str(e)}) + "\n"
            except Exception as e:
                yield json.dumps({"type": "error", "message": f"{type(e).__name__}: {e}"}) + "\n"

        return StreamingResponse(gen(), media_type="application/x-ndjson")

    # ---- React frontend (built into frontend/dist) ----
    if (DIST / "index.html").exists():
        if (DIST / "assets").exists():
            app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                raise HTTPException(404, "Not found.")
            target = (DIST / path).resolve()
            if path and target.is_file() and DIST.resolve() in target.parents:
                return FileResponse(target)
            return FileResponse(DIST / "index.html")
    else:

        @app.get("/", include_in_schema=False)
        def index():
            return HTMLResponse(NO_FRONTEND)

    return app


app = create_app()
