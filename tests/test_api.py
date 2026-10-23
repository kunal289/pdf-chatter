import hashlib
import io
import json
import re

import numpy as np
import pytest
from fastapi.testclient import TestClient
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from app.chunking import split_text
from app.config import Settings
from app.main import create_app

SID = "test-session-123456"
H = {"X-Session-Id": SID}


class FakeLLM:
    """Deterministic hashed bag-of-words embeddings + echoing 'model'."""
    configured = True

    def embed(self, texts, task):
        out = np.zeros((len(texts), 768), dtype=np.float32)
        for i, t in enumerate(texts):
            for w in re.findall(r"\w+", t.lower()):
                out[i, int(hashlib.md5(w.encode()).hexdigest(), 16) % 768] += 1
        n = np.linalg.norm(out, axis=1, keepdims=True)
        n[n == 0] = 1
        return out / n

    async def stream(self, system, turns):
        ctx = turns[-1][1]
        yield "Answer based on: "
        yield ctx.split("\n")[1][:60] if "\n" in ctx else ctx[:60]


def make_pdf(pages):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    for text in pages:
        y = 700
        for line in text.split("\n"):
            c.drawString(72, y, line)
            y -= 16
        c.showPage()
    c.save()
    return buf.getvalue()


@pytest.fixture()
def client(tmp_path):
    s = Settings(data_dir=tmp_path, google_api_key="x")
    return TestClient(create_app(s, llm=FakeLLM()))


def test_chunking():
    text = ("Sentence number one is here. " * 200).strip()
    chunks = split_text(text, 1000, 200)
    assert len(chunks) > 5 and all(len(c) <= 1000 for c in chunks)
    assert split_text("", 1000, 200) == []


def test_health_and_frontend(client):
    h = client.get("/api/health").json()
    assert h["ok"] and h["vector_store"] == "local"
    r = client.get("/")
    assert r.status_code == 200 and "PDF Chatter" in r.text
    # unknown API routes must 404 (not fall through to the SPA)
    assert client.get("/api/nope").status_code == 404


def test_requires_session(client):
    assert client.get("/api/documents").status_code == 400
    assert client.get("/api/documents", headers={"X-Session-Id": "../etc"}).status_code == 400


def test_upload_list_chat_delete(client):
    pdf = make_pdf(["Apples are red fruit.\nThey grow on trees.", "Submarines travel underwater.\nThey use sonar."])
    r = client.post("/api/documents", headers=H, files=[("files", ("fruit.pdf", pdf, "application/pdf"))])
    res = r.json()["results"][0]
    assert res["ok"], res
    doc = res["document"]
    assert doc["pages"] == 2

    assert len(client.get("/api/documents", headers=H).json()["documents"]) == 1
    # other sessions can't see it
    assert client.get("/api/documents", headers={"X-Session-Id": "another-session-99"}).json()["documents"] == []

    r = client.post("/api/chat", headers=H, json={"question": "what uses sonar underwater?", "doc_ids": [doc["id"]]})
    events = [json.loads(l) for l in r.text.strip().split("\n")]
    assert events[0]["type"] == "sources" and events[0]["sources"][0]["page"] == 2
    assert any(e["type"] == "token" for e in events) and events[-1]["type"] == "done"

    assert client.delete(f"/api/documents/{doc['id']}", headers=H).status_code == 200
    assert client.delete(f"/api/documents/{doc['id']}", headers=H).status_code == 404
    assert client.get("/api/documents", headers=H).json()["documents"] == []


def test_bad_files(client):
    r = client.post("/api/documents", headers=H, files=[("files", ("x.pdf", b"not a pdf", "application/pdf"))])
    assert r.json()["results"][0]["ok"] is False
    r = client.post("/api/documents", headers=H, files=[("files", ("x.pdf", b"%PDF-1.4 garbage", "application/pdf"))])
    assert r.json()["results"][0]["ok"] is False


def test_chat_without_docs(client):
    r = client.post("/api/chat", headers=H, json={"question": "hello"})
    events = [json.loads(l) for l in r.text.strip().split("\n")]
    assert "upload" in events[1]["text"].lower()


def test_missing_api_key(tmp_path):
    class NoKey(FakeLLM):
        configured = False
    c = TestClient(create_app(Settings(data_dir=tmp_path), llm=NoKey()))
    assert c.post("/api/chat", headers=H, json={"question": "hi"}).status_code == 503
