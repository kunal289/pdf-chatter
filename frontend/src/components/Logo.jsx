export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M9 7h9l5 5v8a2 2 0 0 1-2 2h-3l-3 3v-3H11a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" fill="#fff" opacity=".96" />
      <path d="M18 7v4a1 1 0 0 0 1 1h4" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M12.5 15h7M12.5 18h4" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
