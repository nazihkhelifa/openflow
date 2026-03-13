export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `Edited ${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  if (diffHr < 24) return `Edited ${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay < 7) return `Edited ${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}
