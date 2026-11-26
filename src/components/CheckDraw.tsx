/**
 * CheckDraw — checkmark dibujado con SVG (círculo + palomita).
 * Momento de éxito en onboarding y operaciones de la consola.
 * Con prefers-reduced-motion aparece estático (CSS ya lo cubre).
 */
export function CheckDraw({ size = 46, color = 'var(--accent, #20BDB8)' }: { size?: number; color?: string }) {
  return (
    <svg
      className="tt-check-svg"
      width={size}
      height={size}
      viewBox="0 0 52 52"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', margin: '0 auto' }}
    >
      <circle
        cx="26" cy="26" r="24"
        stroke={color} strokeWidth="2.5" strokeLinecap="round"
      />
      <path
        d="M 15 27 L 22.5 34.5 L 37 18"
        stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
