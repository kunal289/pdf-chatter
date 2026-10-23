import { useRef, useEffect, useState } from "react";
import { ArrowUp, Square } from "lucide-react";

export default function Composer({ onSend, onStop, busy, blockedReason, scopeLabel }) {
  const [value, setValue] = useState("");
  const ta = useRef(null);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [value]);

  const submit = () => {
    const q = value.trim();
    if (!q || busy || blockedReason) return;
    onSend(q);
    setValue("");
  };

  return (
    <div className="composer-wrap">
      <div className={`composer${blockedReason ? " blocked" : ""}`}>
        <textarea
          ref={ta}
          rows={1}
          value={value}
          maxLength={4000}
          placeholder={blockedReason || "Ask a question about your documents…"}
          disabled={!!blockedReason}
          aria-label="Your question"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {busy ? (
          <button className="send stop" onClick={onStop} aria-label="Stop generating" title="Stop"><Square size={14} fill="currentColor" /></button>
        ) : (
          <button className="send" onClick={submit} disabled={!value.trim() || !!blockedReason} aria-label="Send" title="Send">
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        )}
      </div>
      <p className="composer-hint">
        {scopeLabel} · <kbd>Enter</kbd> to send · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line
      </p>
    </div>
  );
}
