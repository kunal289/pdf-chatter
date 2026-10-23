import io

from pypdf import PdfReader


class PDFError(ValueError):
    pass


def extract_pages(data: bytes) -> list[tuple[int, str]]:
    """Return [(page_number, text)] for pages that contain text."""
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                raise PDFError("PDF is password-protected.")
        pages = []
        for i, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            if text:
                pages.append((i, text))
    except PDFError:
        raise
    except Exception as e:  # corrupt / not a pdf
        raise PDFError(f"Could not read PDF: {e}")
    if not pages:
        raise PDFError("No extractable text found (scanned/image-only PDFs are not supported).")
    return pages
