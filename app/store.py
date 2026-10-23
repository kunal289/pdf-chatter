"""Vector stores (local numpy, or Pinecone) + a small per-session document registry."""
import json
import re
import threading
import time
from pathlib import Path

import numpy as np

from .config import Settings

_SID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def valid_session(sid: str) -> bool:
    return bool(_SID.match(sid or ""))


class Registry:
    """Document metadata per session, stored as JSON on disk."""

    def __init__(self, root: Path):
        self.root = root
        self.lock = threading.Lock()

    def _path(self, sid: str) -> Path:
        d = self.root / "sessions" / sid
        d.mkdir(parents=True, exist_ok=True)
        return d / "docs.json"

    def list(self, sid: str) -> list[dict]:
        p = self._path(sid)
        if not p.exists():
            return []
        return json.loads(p.read_text())

    def add(self, sid: str, doc: dict) -> None:
        with self.lock:
            docs = self.list(sid)
            docs.append(doc)
            self._path(sid).write_text(json.dumps(docs))

    def remove(self, sid: str, doc_id: str) -> bool:
        with self.lock:
            docs = self.list(sid)
            kept = [d for d in docs if d["id"] != doc_id]
            if len(kept) == len(docs):
                return False
            self._path(sid).write_text(json.dumps(kept))
            return True


class LocalStore:
    """Stores normalised vectors (.npy) + chunk text (.json) per document."""

    def __init__(self, root: Path):
        self.root = root

    def _dir(self, sid: str) -> Path:
        d = self.root / "sessions" / sid / "vectors"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def add(self, sid: str, doc_id: str, chunks: list[dict], vectors: np.ndarray) -> None:
        d = self._dir(sid)
        np.save(d / f"{doc_id}.npy", vectors.astype(np.float32))
        (d / f"{doc_id}.json").write_text(json.dumps(chunks))

    def query(self, sid: str, doc_ids: list[str], vector: np.ndarray, k: int) -> list[dict]:
        d = self._dir(sid)
        hits: list[dict] = []
        for doc_id in doc_ids:
            vp, cp = d / f"{doc_id}.npy", d / f"{doc_id}.json"
            if not (vp.exists() and cp.exists()):
                continue
            vecs = np.load(vp)
            chunks = json.loads(cp.read_text())
            scores = vecs @ vector
            for i in np.argsort(-scores)[:k]:
                hits.append({**chunks[int(i)], "doc_id": doc_id, "score": float(scores[int(i)])})
        hits.sort(key=lambda h: -h["score"])
        return hits[:k]

    def delete(self, sid: str, doc_id: str) -> None:
        d = self._dir(sid)
        for ext in ("npy", "json"):
            (d / f"{doc_id}.{ext}").unlink(missing_ok=True)


class PineconeStore:
    """Same interface, backed by Pinecone (serverless). Session/doc isolation via metadata filters."""

    def __init__(self, s: Settings):
        from pinecone import Pinecone, ServerlessSpec

        pc = Pinecone(api_key=s.pinecone_api_key)
        if s.pinecone_index not in pc.list_indexes().names():
            pc.create_index(
                name=s.pinecone_index,
                dimension=s.embedding_dim,
                metric="cosine",
                spec=ServerlessSpec(cloud=s.pinecone_cloud, region=s.pinecone_region),
            )
            while not pc.describe_index(s.pinecone_index).status["ready"]:
                time.sleep(1)
        self.index = pc.Index(s.pinecone_index)

    def add(self, sid, doc_id, chunks, vectors):
        items = [
            {
                "id": f"{doc_id}-{i}",
                "values": vectors[i].tolist(),
                "metadata": {"session": sid, "doc_id": doc_id, **chunks[i]},
            }
            for i in range(len(chunks))
        ]
        for i in range(0, len(items), 100):
            self.index.upsert(vectors=items[i : i + 100])

    def query(self, sid, doc_ids, vector, k):
        if not doc_ids:
            return []
        res = self.index.query(
            vector=vector.tolist(),
            top_k=k,
            include_metadata=True,
            filter={"session": {"$eq": sid}, "doc_id": {"$in": doc_ids}},
        )
        return [{**m.metadata, "score": m.score} for m in res.matches]

    def delete(self, sid, doc_id):
        try:
            self.index.delete(filter={"session": {"$eq": sid}, "doc_id": {"$eq": doc_id}})
        except Exception:
            # Serverless indexes may not support delete-by-filter; remove by id prefix instead
            ids = []
            for page in self.index.list(prefix=f"{doc_id}-"):
                ids.extend(page)
            if ids:
                self.index.delete(ids=ids)


def make_store(s: Settings):
    if s.pinecone_api_key:
        return PineconeStore(s)
    return LocalStore(s.data_dir)
