"""Simple boundary-aware text splitter (chunk_size / overlap in characters)."""
import re

_BREAKS = ("\n\n", "\n", ". ", "? ", "! ", " ")


def split_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    text = re.sub(r"[ \t]+", " ", text).strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)
        if end < n:
            window_floor = start + int(chunk_size * 0.6)
            for sep in _BREAKS:
                idx = text.rfind(sep, window_floor, end)
                if idx != -1:
                    end = idx + len(sep)
                    break
        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return chunks
