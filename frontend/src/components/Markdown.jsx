import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";

// Turn "[1]" / "[1, 3]" into clickable cite links that our renderer picks up.
function withCites(text) {
  return text.replace(/\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g, (_, nums) =>
    nums.split(",").map((n) => `[${n.trim()}](cite:${n.trim()})`).join("")
  );
}

export default function Markdown({ children, onCite }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith("cite:") ? url : defaultUrlTransform(url))}
        components={{
          a({ href, children: c }) {
            if (href?.startsWith("cite:")) {
              const n = Number(href.slice(5));
              return (
                <button type="button" className="cite" onClick={() => onCite?.(n)} title={`Jump to source ${n}`}>
                  {n}
                </button>
              );
            }
            return <a href={href} target="_blank" rel="noopener noreferrer">{c}</a>;
          },
          table: ({ children: c }) => <div className="table-wrap"><table>{c}</table></div>,
        }}
      >
        {withCites(children)}
      </ReactMarkdown>
    </div>
  );
}
