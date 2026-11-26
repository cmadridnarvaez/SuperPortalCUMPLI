import { useEffect, useRef, useState } from 'react';

/**
 * useCountUp — anima un número de 0 (o valor anterior) al valor actual.
 * Respeta prefers-reduced-motion: devuelve el valor final inmediatamente.
 * Duración ~700ms con easing ease-out-quart (natural, no robótico).
 */
export function useCountUp(target: number, options?: { duration?: number; format?: (n: number) => string }): string {
  const { duration = 700, format } = options || {};
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);
  const rafRef = useRef<number>(0);

  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reducedMotion || target === prevRef.current) {
      setDisplay(target);
      prevRef.current = target;
      return;
    }

    const from = prevRef.current;
    const to = target;
    const t0 = performance.now();
    prevRef.current = target;

    const tick = (t: number) => {
      const p = Math.min((t - t0) / duration, 1);
      // ease-out-quart: 1 - (1-p)^4
      const eased = 1 - Math.pow(1 - p, 4);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, reducedMotion]);

  return format ? format(display) : String(display);
}
