// Deterministic gradient avatar derived from each account's hue (no uploads needed for the MVP).
export default function Avatar({ user, size = 40, ring = false }) {
  const hue = user?.avatarHue ?? 260;
  const initial = (user?.displayName || user?.username || '?').trim().charAt(0).toUpperCase();
  return (
    <span
      className={`avatar${ring ? ' avatar--ring' : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: `linear-gradient(135deg, hsl(${hue} 85% 62%), hsl(${(hue + 50) % 360} 85% 52%))`,
      }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}
