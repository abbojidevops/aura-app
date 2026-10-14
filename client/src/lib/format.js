// Parse server timestamps (SQLite UTC "YYYY-MM-DD HH:MM:SS" or ISO) into Dates.
export function parseDate(value) {
  if (!value) return new Date();
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : value.replace(' ', 'T') + 'Z';
  return new Date(iso);
}

export function timeAgo(value) {
  const seconds = Math.max(0, (Date.now() - parseDate(value).getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return parseDate(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatCount(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) return `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

export function plural(n, word) {
  return `${formatCount(n)} ${word}${n === 1 ? '' : 's'}`;
}
