// Thin client for the FastAPI backend.
const SID_KEY = "pdfchatter.sid";

export function getSessionId() {
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid) {
      const raw = crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random().toString(36).slice(2);
      sid = String(raw).replace(/[^A-Za-z0-9_-]/g, "");
      localStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return "anon" + Math.random().toString(36).slice(2, 12);
  }
}

const SID = getSessionId();

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function errorFrom(res) {
  try {
    const body = await res.json();
    const d = body.detail;
    if (typeof d === "string") return new ApiError(d, res.status);
    if (Array.isArray(d)) return new ApiError(d.map((x) => x.msg).join("; "), res.status);
  } catch { /* not JSON */ }
  return new ApiError(res.statusText || `Request failed (${res.status})`, res.status);
}

async function request(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, { ...opts, headers: { "X-Session-Id": SID, ...(opts.headers || {}) } });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError("Cannot reach the server. Is the backend running?", 0);
  }
  if (!res.ok) throw await errorFrom(res);
  return res;
}

export const getHealth = async () => (await request("/api/health")).json();
export const listDocuments = async () => (await request("/api/documents")).json().then((d) => d.documents || []);

export async function uploadDocuments(files) {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  const res = await request("/api/documents", { method: "POST", body: fd });
  return (await res.json()).results;
}

export const deleteDocument = (id) => request(`/api/documents/${id}`, { method: "DELETE" });

/** Async generator over the NDJSON chat stream: yields {type, ...} events. */
export async function* streamChat({ question, docIds, history, signal }) {
  const res = await request("/api/chat", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, doc_ids: docIds, history }),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buf.trim()) yield JSON.parse(buf.trim());
}
