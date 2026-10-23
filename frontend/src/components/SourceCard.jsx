import { useState } from "react";
import { FileText } from "lucide-react";

export default function SourceCard({ source, active, id }) {
  const [open, setOpen] = useState(false);
  const pct = Math.max(0, Math.min(100, Math.round(source.score * 100)));
  const expanded = open || active;
  return (
    <article id={id} className={`source${active ? " active" : ""}`}>
      <header>
        <span className="src-n">{source.n}</span>
        <FileText size={13} className="src-icon" />
        <span className="src-doc" title={source.doc}>{source.doc}</span>
        <span className="src-page">p. {source.page}</span>
        <span className="src-score" title="Semantic similarity to your question">{pct}% match</span>
      </header>
      <div className="src-bar"><i style={{ width: `${pct}%` }} /></div>
      <p className={`src-snippet${expanded ? " open" : ""}`}>{source.snippet}</p>
      <button className="link-btn small" onClick={() => setOpen((o) => !o)}>{expanded ? "Show less" : "Show more"}</button>
    </article>
  );
}
