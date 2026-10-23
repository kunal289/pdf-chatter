import time
import uuid
from typing import AsyncIterator

from .chunking import split_text
from .config import Settings
from .pdf import extract_pages
from .store import Registry

SYSTEM_PROMPT = """You are a helpful assistant that answers questions about the user's uploaded PDF documents.
Use ONLY the provided context excerpts. Be thorough and include all relevant details.
Cite sources inline like [1], [2] using the numbers of the excerpts you used.
If the answer is not in the context, say you don't know based on the documents - do not make anything up.
Format answers in Markdown."""


class RAGService:
    def __init__(self, settings: Settings, llm, store, registry: Registry):
        self.s, self.llm, self.store, self.registry = settings, llm, store, registry

    # ---------- ingestion ----------
    def ingest(self, sid: str, filename: str, data: bytes) -> dict:
        pages = extract_pages(data)
        chunks: list[dict] = []
        for page_no, text in pages:
            for piece in split_text(text, self.s.chunk_size, self.s.chunk_overlap):
                chunks.append({"text": piece, "page": page_no, "doc": filename})
        vectors = self.llm.embed([c["text"] for c in chunks], "RETRIEVAL_DOCUMENT")
        doc_id = uuid.uuid4().hex[:12]
        self.store.add(sid, doc_id, chunks, vectors)
        doc = {
            "id": doc_id,
            "name": filename,
            "pages": pages[-1][0],
            "chunks": len(chunks),
            "size": len(data),
            "created": int(time.time()),
        }
        self.registry.add(sid, doc)
        return doc

    def delete(self, sid: str, doc_id: str) -> bool:
        if not self.registry.remove(sid, doc_id):
            return False
        self.store.delete(sid, doc_id)
        return True

    # ---------- chat ----------
    def retrieve(self, sid: str, question: str, doc_ids: list[str]) -> list[dict]:
        known = {d["id"] for d in self.registry.list(sid)}
        ids = [d for d in (doc_ids or known) if d in known]
        if not ids:
            return []
        qv = self.llm.embed([question], "RETRIEVAL_QUERY")[0]
        return self.store.query(sid, ids, qv, self.s.top_k)

    @staticmethod
    def build_turns(question: str, hits: list[dict], history: list[dict]) -> list[tuple[str, str]]:
        context = "\n\n".join(
            f"[{i}] ({h['doc']}, page {h['page']})\n{h['text']}" for i, h in enumerate(hits, 1)
        )
        turns = []
        for m in history[-6:]:
            role = "model" if m.get("role") == "assistant" else "user"
            turns.append((role, str(m.get("content", ""))[:4000]))
        turns.append(("user", f"Context:\n{context}\n\nQuestion: {question}"))
        return turns

    async def answer(self, sid, question, doc_ids, history) -> AsyncIterator[tuple[str, object]]:
        """Yields ('sources', [...]) once, then ('token', str) repeatedly."""
        from starlette.concurrency import run_in_threadpool

        hits = await run_in_threadpool(self.retrieve, sid, question, doc_ids)
        if not hits:
            yield "sources", []
            yield "token", "Please upload and select at least one PDF first, so I have something to search."
            return
        yield "sources", [
            {
                "n": i,
                "doc": h["doc"],
                "page": h["page"],
                "score": round(h["score"], 3),
                "snippet": h["text"][:400],
            }
            for i, h in enumerate(hits, 1)
        ]
        async for token in self.llm.stream(SYSTEM_PROMPT, self.build_turns(question, hits, history)):
            yield "token", token
