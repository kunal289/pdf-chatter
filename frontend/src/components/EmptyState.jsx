import { FileSearch, Quote, Layers, ListChecks, CloudUpload } from "lucide-react";

const PROMPTS = [
  { icon: ListChecks, text: "Summarize the key points of these documents" },
  { icon: FileSearch, text: "What are the main conclusions or recommendations?" },
  { icon: Quote, text: "List important dates, figures and named entities" },
  { icon: Layers, text: "Compare how the documents treat the same topic", multi: true },
];

export default function EmptyState({ hasDocs, hasSelection, multiDoc, onPrompt }) {
  return (
    <div className="empty">
      <div className="empty-eyebrow">Retrieval-augmented answers</div>
      <h1>Ask your documents <em>anything.</em></h1>
      <p className="empty-sub">
        Upload PDFs, then ask in plain language. Every answer is grounded in your files and cites the exact
        document and page it came from.
      </p>

      {!hasDocs ? (
        <div className="empty-steps">
          <div><span>1</span><b>Upload</b>Drop one or more PDFs in the sidebar.</div>
          <div><span>2</span><b>Ask</b>Query a single file or several at once.</div>
          <div><span>3</span><b>Verify</b>Check every claim against its source page.</div>
        </div>
      ) : (
        <div className="prompt-grid">
          {PROMPTS.filter((p) => !p.multi || multiDoc).map(({ icon: Icon, text }) => (
            <button key={text} className="prompt" disabled={!hasSelection} onClick={() => onPrompt(text)}>
              <Icon size={16} />
              <span>{text}</span>
            </button>
          ))}
        </div>
      )}
      {!hasDocs && (
        <p className="empty-hint"><CloudUpload size={14} /> Start by uploading a PDF.</p>
      )}
    </div>
  );
}
