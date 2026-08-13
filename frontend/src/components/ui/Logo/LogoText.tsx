export function LogoText({ className = "", height = 24, style }: { className?: string; height?: number; style?: React.CSSProperties }) {
  return (
    <span 
      className={className}
      style={{ 
        fontFamily: 'var(--font-heading, Inter, sans-serif)',
        fontSize: `${height * 0.85}px`,
        fontWeight: 800,
        letterSpacing: '-0.04em',
        textTransform: 'uppercase' as const,
        color: 'currentColor',
        lineHeight: 1,
        userSelect: 'none',
        ...style 
      }}
    >
      SKILLER
    </span>
  );
}
