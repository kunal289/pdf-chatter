import { X, Cpu, Database } from "lucide-react";
import Logo from "./Logo.jsx";
import UploadZone from "./UploadZone.jsx";
import DocumentList from "./DocumentList.jsx";

export default function Sidebar({ open, onClose, health, ...docProps }) {
  const store = health?.vector_store === "pinecone" ? "Pinecone" : "Local store";
  return (
    <>
      <div className={`scrim${open ? " show" : ""}`} onClick={onClose} />
      <aside className={`sidebar${open ? " open" : ""}`} aria-label="Sidebar">
        <div className="brand">
          <Logo size={34} />
          <div>
            <div className="brand-name">PDF Chatter</div>
            <div className="brand-tag">Document Q&amp;A with citations</div>
          </div>
          <button className="icon-btn close-side" onClick={onClose} aria-label="Close sidebar"><X size={18} /></button>
        </div>

        <UploadZone onUpload={docProps.onUpload} maxMb={health?.max_upload_mb ?? 25} disabled={!health?.gemini_configured && health !== null} />
        <DocumentList {...docProps} />

        <footer className="side-foot">
          <span className={`dot ${health ? (health.gemini_configured ? "ok" : "warn") : "off"}`} />
          <span className="foot-line">
            <Cpu size={12} /> {health?.model ?? "Connecting…"}
          </span>
          <span className="foot-line">
            <Database size={12} /> {health ? store : "—"}
          </span>
        </footer>
      </aside>
    </>
  );
}
