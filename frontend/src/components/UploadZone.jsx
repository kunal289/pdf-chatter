import { useRef, useState } from "react";
import { CloudUpload, Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function UploadZone({ onUpload, maxMb, disabled }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const timer = useRef(null);

  const handle = async (list) => {
    const files = [...list].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (!files.length) {
      setResults([{ name: "Selection", ok: false, error: "Please choose PDF files." }]);
      return;
    }
    clearTimeout(timer.current);
    setBusy(true);
    setResults([]);
    try {
      setResults(await onUpload(files));
    } catch (e) {
      setResults([{ name: "Upload", ok: false, error: e.message }]);
    } finally {
      setBusy(false);
      timer.current = setTimeout(() => setResults((r) => r.filter((x) => !x.ok)), 6000);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    if (!busy && !disabled) handle(e.dataTransfer.files);
  };

  return (
    <div className="upload">
      <div
        className={`dropzone${drag ? " drag" : ""}${busy ? " busy" : ""}`}
        role="button"
        tabIndex={0}
        aria-disabled={busy || disabled}
        onClick={() => !busy && !disabled && input.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !busy && !disabled) {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragEnter={(e) => { e.preventDefault(); setDrag(true); }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => { if (e.target.files.length) handle(e.target.files); e.target.value = ""; }}
        />
        <div className="dz-icon">{busy ? <Loader2 size={20} className="spin" /> : <CloudUpload size={20} />}</div>
        <div className="dz-text">
          <strong>{busy ? "Indexing documents…" : "Upload PDFs"}</strong>
          <span>{busy ? "Extracting, chunking and embedding" : `Drop files or browse · max ${maxMb} MB`}</span>
        </div>
      </div>
      {results.length > 0 && (
        <ul className="upload-results" aria-live="polite">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? "ok" : "err"}>
              {r.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              <span><b>{r.name}</b>{r.ok ? " indexed" : ` — ${r.error}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
