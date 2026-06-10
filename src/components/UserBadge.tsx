const AVATAR_COLORS = ['#6366f1', '#0891b2', '#16a34a', '#d97706', '#7c3aed', '#0d9488', '#db2777'];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

interface UserBadgeProps {
  name?: string | null;
  /** Show only the avatar circle without the name text. Default false. */
  avatarOnly?: boolean;
  size?: number;
}

export function UserBadge({ name, avatarOnly = false, size = 26 }: UserBadgeProps) {
  if (!name) return <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>;

  const color = avatarColor(name);
  const abbr  = initials(name);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: size, height: size,
        borderRadius: '50%',
        background: color,
        color: '#fff',
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        letterSpacing: '-0.01em',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        userSelect: 'none' as const,
      }}>
        {abbr}
      </span>
      {!avatarOnly && (
        <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{name}</span>
      )}
    </span>
  );
}
