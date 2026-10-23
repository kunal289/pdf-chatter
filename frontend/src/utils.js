export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function fmtSize(bytes) {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}

export function fmtDate(ts) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function friendlyError(msg = "") {
  const m = msg.toLowerCase();
  if (m.includes("api key") || m.includes("api_key") || m.includes("permission_denied"))
    return "Gemini rejected the API key. Check GOOGLE_API_KEY in your .env file.";
  if (m.includes("429") || m.includes("resource_exhausted") || m.includes("quota"))
    return "Gemini rate limit reached. Wait a moment and try again.";
  if (m.includes("cannot reach")) return msg;
  return msg || "Something went wrong. Please try again.";
}
