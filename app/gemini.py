"""Thin wrapper around the Google Gemini API (google-genai SDK)."""
import time
from typing import AsyncIterator

import numpy as np
from google import genai
from google.genai import types

from .config import Settings


class LLMNotConfigured(RuntimeError):
    pass


def _normalize(m: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(m, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return m / norms


class GeminiClient:
    def __init__(self, settings: Settings):
        self.s = settings
        self._client: genai.Client | None = None

    @property
    def configured(self) -> bool:
        return bool(self.s.google_api_key)

    @property
    def client(self) -> genai.Client:
        if not self.configured:
            raise LLMNotConfigured("GOOGLE_API_KEY is not set. Add it to your .env file.")
        if self._client is None:
            self._client = genai.Client(api_key=self.s.google_api_key)
        return self._client

    def embed(self, texts: list[str], task: str) -> np.ndarray:
        """task: RETRIEVAL_DOCUMENT or RETRIEVAL_QUERY. Returns L2-normalised (n, dim) float32."""
        out: list[list[float]] = []
        for i in range(0, len(texts), 100):
            batch = texts[i : i + 100]
            for attempt in range(4):
                try:
                    res = self.client.models.embed_content(
                        model=self.s.embedding_model,
                        contents=batch,
                        config=types.EmbedContentConfig(
                            task_type=task, output_dimensionality=self.s.embedding_dim
                        ),
                    )
                    out.extend(e.values for e in res.embeddings)
                    break
                except LLMNotConfigured:
                    raise
                except Exception as e:
                    # Don't retry client errors (bad key, bad request); retry transient ones.
                    if attempt == 3 or getattr(e, "code", None) in (400, 401, 403, 404):
                        raise
                    time.sleep(2**attempt)
        return _normalize(np.asarray(out, dtype=np.float32))

    async def stream(self, system: str, turns: list[tuple[str, str]]) -> AsyncIterator[str]:
        """turns: [(role, text)] with role in {'user','model'}."""
        contents = [types.Content(role=r, parts=[types.Part(text=t)]) for r, t in turns]
        stream = await self.client.aio.models.generate_content_stream(
            model=self.s.gemini_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system, temperature=0.3, top_p=0.85, top_k=40
            ),
        )
        async for chunk in stream:
            if chunk.text:
                yield chunk.text
