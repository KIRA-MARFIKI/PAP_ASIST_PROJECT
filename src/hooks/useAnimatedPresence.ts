import { RefObject, useEffect, useState } from 'react';
import gsap from 'gsap';

/**
 * Mengelola mount/unmount modal dengan animasi masuk & keluar GSAP yang menghormati `prefers-reduced-motion`.
 */
export function useAnimatedPresence(
  isOpen: boolean,
  backdropRef: RefObject<HTMLElement | null>,
  dialogRef: RefObject<HTMLElement | null>
): boolean {
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!shouldRender) return;
    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    if (!backdrop || !dialog) {
      if (!isOpen) setShouldRender(false);
      return;
    }

    const mm = gsap.matchMedia();

    if (isOpen) {
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' });
        gsap.fromTo(
          dialog,
          { opacity: 0, y: 12, scale: 0.985 },
          { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: 'power2.out' }
        );
      });
      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set(backdrop, { opacity: 1 });
        gsap.set(dialog, { opacity: 1, y: 0, scale: 1 });
      });
    } else {
      let animated = false;
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        animated = true;
        gsap.to(backdrop, { opacity: 0, duration: 0.16, ease: 'power2.in' });
        gsap.to(dialog, {
          opacity: 0,
          y: 8,
          scale: 0.985,
          duration: 0.16,
          ease: 'power2.in',
          onComplete: () => setShouldRender(false),
        });
      });
      mm.add('(prefers-reduced-motion: reduce)', () => {
        animated = true;
        setShouldRender(false);
      });
      if (!animated) {
        setShouldRender(false);
      }
    }

    return () => mm.revert();
  }, [isOpen, shouldRender, backdropRef, dialogRef]);

  return shouldRender;
}
