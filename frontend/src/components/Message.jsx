import { useState, useRef, useEffect } from "react";
import { Copy, Check, RefreshCw, AlertTriangle, BookOpen, Square } from "lucide-react";
import Logo from "./Logo.jsx";
import Markdown from "./Markdown.jsx";
import SourceCard from "./SourceCard.jsx";

export default function Message({ msg, isLast, busy, onRegenerate }) {
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [active, setActive] = useState(null);
  const flash = useRef(null);

  useEffect(() => () => clearTimeout(flash.current), []);

  if (msg.role === "user") {
    return (
      <div className="msg user">
        <div className="bubble">{msg.content}</div>
      </div>
    );
  }

  const streaming = msg.status === "streaming";
  const sources = msg.sources || [];
  const docCount = new Set(sources.map((s) => s.doc)).size;

  const jump = (n) => {
    if (!sources.some((s) => s.n === n)) return;
    setShowSources(true);
    setActive(n);
    clearTimeout(flash.current);
    flash.current = setTimeout(() => setActive(null), 2400);
    requestAnimationFrame(() =>
      document.getElementById(`src-${msg.id}-${n}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="msg assistant">
      <div className="avatar"><Logo size={28} /></div>
      <div className="body">
        {streaming && !msg.content && (
          <div className="thinking" aria-label="Thinking"><i /><i /><i /><span>Searching your documents…</span></div>
        )}
        {msg.content && <Markdown onCite={jump}>{msg.content}</Markdown>}
        {streaming && msg.content && <span className="caret" />}

        {msg.status === "stopped" && (
          <div className="note"><Square size={12} /> Generation stopped</div>
        )}
        {msg.status === "error" && (
          <div className="alert" role="alert"><AlertTriangle size={16} /><span>{msg.error}</span></div>
        )}

        {sources.length > 0 && (
          <div className="sources">
            <button className="sources-toggle" onClick={() => setShowSources((s) => !s)} aria-expanded={showSources}>
              <BookOpen size={14} />
              <span>{sources.length} sources from {docCount} {docCount === 1 ? "document" : "documents"}</span>
              <span className="chev">{showSources ? "Hide" : "View"}</span>
            </button>
            {!showSources && (
              <div className="pills">
                {sources.map((s) => (
                  <button key={s.n} className="pill" onClick={() => jump(s.n)} title={s.doc}>
                    <b>{s.n}</b> {s.doc.replace(/\.pdf$/i, "")} · p.{s.page}
                  </button>
                ))}
              </div>
            )}
            {showSources && (
              <div className="source-list">
                {sources.map((s) => (
                  <SourceCard key={s.n} source={s} active={active === s.n} id={`src-${msg.id}-${s.n}`} />
                ))}
              </div>
            )}
          </div>
        )}

        {!streaming && msg.content && (
          <div className="actions">
            <button className="icon-btn" onClick={copy} aria-label="Copy answer" title="Copy">
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
            {isLast && !busy && (
              <button className="icon-btn" onClick={onRegenerate} aria-label="Regenerate answer" title="Regenerate">
                <RefreshCw size={15} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
