import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, Sun, Moon, Eraser, AlertTriangle, X, FileStack } from "lucide-react";
import Sidebar from "./components/Sidebar.jsx";
import Message from "./components/Message.jsx";
import Composer from "./components/Composer.jsx";
import EmptyState from "./components/EmptyState.jsx";
import { deleteDocument, getHealth, listDocuments, streamChat, uploadDocuments } from "./api.js";
import { friendlyError, loadJSON, saveJSON, uid } from "./utils.js";

const SEL_KEY = "pdfchatter.selected";
const CHAT_KEY = "pdfchatter.chat";

export default function App() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || "light");
  const [health, setHealth] = useState(null);
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set(loadJSON(SEL_KEY, [])));
  const [messages, setMessages] = useState(() => loadJSON(CHAT_KEY, []));
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const abortRef = useRef(null);
  const scroller = useRef(null);
  const stick = useRef(true);
  const firstLoad = useRef(loadJSON(SEL_KEY, null) === null);

  /* ---------- theme ---------- */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("pdfchatter.theme", theme); } catch { /* ignore */ }
  }, [theme]);

  /* ---------- toast ---------- */
  const notify = useCallback((message) => {
    setToast(message);
    clearTimeout(notify.t);
    notify.t = setTimeout(() => setToast(null), 5000);
  }, []);

  /* ---------- initial load ---------- */
  const refreshDocs = useCallback(async () => {
    try {
      const list = await listDocuments();
      setDocs(list);
      setSelected((prev) => {
        const ids = new Set(list.map((d) => d.id));
        if (firstLoad.current) { firstLoad.current = false; return ids; }
        return new Set([...prev].filter((id) => ids.has(id)));
      });
    } catch (e) {
      notify(e.message);
    } finally {
      setDocsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null));
    refreshDocs();
  }, [refreshDocs]);

  /* ---------- persistence ---------- */
  useEffect(() => { if (!docsLoading) saveJSON(SEL_KEY, [...selected]); }, [selected, docsLoading]);
  useEffect(() => {
    if (busy) return;
    saveJSON(CHAT_KEY, messages.slice(-60).map((m) => (m.status === "streaming" ? { ...m, status: "stopped" } : m)));
  }, [messages, busy]);

  /* ---------- autoscroll ---------- */
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const onScroll = () => {
    const el = scroller.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  /* ---------- documents ---------- */
  const toggleDoc = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((prev) => (docs.every((d) => prev.has(d.id)) ? new Set() : new Set(docs.map((d) => d.id))));

  const handleUpload = async (files) => {
    const results = await uploadDocuments(files);
    const added = results.filter((r) => r.ok).map((r) => r.document.id);
    setSelected((prev) => new Set([...prev, ...added]));
    await refreshDocs();
    return results;
  };

  const handleDelete = async (id) => {
    try {
      await deleteDocument(id);
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      await refreshDocs();
    } catch (e) {
      notify(e.message);
    }
  };

  /* ---------- chat ---------- */
  const ask = async (question, base = messages) => {
    if (busy || !question.trim()) return;
    const history = base
      .filter((m) => m.content && m.status !== "error")
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));
    const bot = { id: uid(), role: "assistant", content: "", sources: [], status: "streaming" };
    setMessages([...base, { id: uid(), role: "user", content: question }, bot]);
    setBusy(true);
    stick.current = true;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const patch = (fn) => setMessages((ms) => ms.map((m) => (m.id === bot.id ? fn(m) : m)));
    try {
      for await (const ev of streamChat({ question, docIds: [...selected], history, signal: ctrl.signal })) {
        if (ev.type === "sources") patch((m) => ({ ...m, sources: ev.sources }));
        else if (ev.type === "token") patch((m) => ({ ...m, content: m.content + ev.text }));
        else if (ev.type === "error") throw new Error(ev.message);
      }
      patch((m) => ({ ...m, status: "done" }));
    } catch (e) {
      if (e.name === "AbortError") patch((m) => ({ ...m, status: "stopped" }));
      else patch((m) => ({ ...m, status: "error", error: friendlyError(e.message) }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const regenerate = () => {
    const lastUser = [...messages].reverse().findIndex((m) => m.role === "user");
    if (lastUser < 0) return;
    const idx = messages.length - 1 - lastUser;
    ask(messages[idx].content, messages.slice(0, idx));
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
  };

  /* ---------- derived ---------- */
  const selCount = docs.filter((d) => selected.has(d.id)).length;
  const hasDocs = docs.length > 0;
  const blockedReason = !hasDocs
    ? "Upload a PDF to start asking questions"
    : selCount === 0
    ? "Select at least one document in the library"
    : health && !health.gemini_configured
    ? "Server is missing GOOGLE_API_KEY"
    : "";
  const scopeLabel = hasDocs ? `Searching ${selCount} of ${docs.length} ${docs.length === 1 ? "document" : "documents"}` : "No documents";

  return (
    <div className="app">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        health={health}
        docs={docs}
        loading={docsLoading}
        selected={selected}
        onToggle={toggleDoc}
        onToggleAll={toggleAll}
        onDelete={handleDelete}
        onUpload={handleUpload}
      />

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open library"><Menu size={19} /></button>
          <div className="topbar-title">
            <h2>Conversation</h2>
            <span className={`scope${selCount ? "" : " none"}`}><FileStack size={13} /> {scopeLabel}</span>
          </div>
          <div className="topbar-actions">
            <button className="btn-ghost" onClick={clearChat} disabled={!messages.length} title="Clear conversation">
              <Eraser size={15} /> <span>Clear</span>
            </button>
            <button className="icon-btn" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} aria-label="Toggle theme" title="Toggle theme">
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </header>

        {health && !health.gemini_configured && (
          <div className="banner" role="alert">
            <AlertTriangle size={16} />
            <span>The server has no <code>GOOGLE_API_KEY</code>. Add it to your <code>.env</code> file and restart the backend.</span>
          </div>
        )}

        <div className="scroll" ref={scroller} onScroll={onScroll}>
          <div className="thread">
            {messages.length === 0 ? (
              <EmptyState
                hasDocs={hasDocs}
                hasSelection={selCount > 0 && !blockedReason}
                multiDoc={selCount > 1}
                onPrompt={(t) => ask(t)}
              />
            ) : (
              messages.map((m, i) => (
                <Message key={m.id} msg={m} isLast={i === messages.length - 1} busy={busy} onRegenerate={regenerate} />
              ))
            )}
          </div>
        </div>

        <Composer onSend={(q) => ask(q)} onStop={() => abortRef.current?.abort()} busy={busy} blockedReason={blockedReason} scopeLabel={scopeLabel} />

        {toast && (
          <div className="toast" role="status">
            <AlertTriangle size={15} /> <span>{toast}</span>
            <button className="icon-btn" onClick={() => setToast(null)} aria-label="Dismiss"><X size={14} /></button>
          </div>
        )}
      </main>
    </div>
  );
}
