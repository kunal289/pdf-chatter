import { useMemo, useState } from "react";
import { FileText, Trash2, Search, Check } from "lucide-react";
import { fmtSize, fmtDate } from "../utils.js";

function DocCard({ doc, selected, onToggle, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className={`doc${selected ? " selected" : ""}`}>
      <button
        className="doc-main"
        onClick={() => onToggle(doc.id)}
        aria-pressed={selected}
        title={selected ? "Included in answers — click to exclude" : "Excluded — click to include"}
      >
        <span className="doc-check" aria-hidden="true">{selected ? <Check size={13} strokeWidth={3} /> : <FileText size={14} />}</span>
        <span className="doc-meta">
          <span className="doc-name" title={doc.name}>{doc.name}</span>
          <span className="doc-sub">
            {doc.pages} {doc.pages === 1 ? "page" : "pages"} · {doc.chunks} {doc.chunks === 1 ? "chunk" : "chunks"} · {fmtSize(doc.size)}
            {doc.created ? ` · ${fmtDate(doc.created)}` : ""}
          </span>
        </span>
      </button>
      {confirming ? (
        <span className="doc-confirm">
          <button className="btn-mini danger" onClick={() => onDelete(doc.id)}>Delete</button>
          <button className="btn-mini" onClick={() => setConfirming(false)}>Cancel</button>
        </span>
      ) : (
        <button className="icon-btn doc-del" aria-label={`Delete ${doc.name}`} title="Delete document" onClick={() => setConfirming(true)}>
          <Trash2 size={15} />
        </button>
      )}
    </li>
  );
}

export default function DocumentList({ docs, loading, selected, onToggle, onToggleAll, onDelete }) {
  const [q, setQ] = useState("");
  const shown = useMemo(
    () => docs.filter((d) => d.name.toLowerCase().includes(q.trim().toLowerCase())),
    [docs, q]
  );
  const allOn = docs.length > 0 && docs.every((d) => selected.has(d.id));

  return (
    <section className="library" aria-label="Documents">
      <div className="section-head">
        <h2>Library <span className="count">{docs.length}</span></h2>
        {docs.length > 1 && (
          <button className="link-btn" onClick={onToggleAll}>{allOn ? "Clear all" : "Select all"}</button>
        )}
      </div>

      {docs.length > 5 && (
        <label className="search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter documents" />
        </label>
      )}

      {loading ? (
        <ul className="doc-list">{[0, 1].map((i) => <li key={i} className="doc skeleton" />)}</ul>
      ) : docs.length === 0 ? (
        <p className="library-empty">No documents yet. Upload a PDF to start a conversation with it.</p>
      ) : (
        <ul className="doc-list">
          {shown.map((d) => (
            <DocCard key={d.id} doc={d} selected={selected.has(d.id)} onToggle={onToggle} onDelete={onDelete} />
          ))}
          {shown.length === 0 && <li className="library-empty">No matches.</li>}
        </ul>
      )}
    </section>
  );
}
