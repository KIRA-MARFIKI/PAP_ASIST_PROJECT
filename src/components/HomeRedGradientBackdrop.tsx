import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Pause, Play } from 'lucide-react';

export function HomeRedGradientBackdrop() {
  const containerRef = useRef<HTMLDivElement>(null);
  const trPrimaryRef = useRef<HTMLDivElement>(null);
  const trSecondaryRef = useRef<HTMLDivElement>(null);
  const blPrimaryRef = useRef<HTMLDivElement>(null);
  const blSecondaryRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  const [isPaused, setIsPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    setPrefersReducedMotion(mq.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const trPrimary = trPrimaryRef.current;
    const trSecondary = trSecondaryRef.current;
    const blPrimary = blPrimaryRef.current;
    const blSecondary = blSecondaryRef.current;
    if (!trPrimary || !trSecondary || !blPrimary || !blSecondary) return;

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline();

        tl.to(
          trPrimary,
          {
            x: -28,
            y: 22,
            scale: 1.08,
            rotation: 6,
            opacity: 0.9,
            duration: 7.5,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          },
          0
        );

        tl.to(
          trSecondary,
          {
            x: 18,
            y: -14,
            scale: 0.94,
            rotation: -5,
            opacity: 0.84,
            duration: 9.5,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          },
          0
        );

        tl.to(
          blPrimary,
          {
            x: 30,
            y: -24,
            scale: 1.1,
            rotation: -6,
            opacity: 0.9,
            duration: 8.5,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          },
          0
        );

        tl.to(
          blSecondary,
          {
            x: -16,
            y: 18,
            scale: 0.93,
            rotation: 5,
            opacity: 0.84,
            duration: 10.5,
            ease: 'sine.inOut',
            repeat: -1,
            yoyo: true,
          },
          0
        );

        timelineRef.current = tl;
        return () => {
          tl.kill();
          timelineRef.current = null;
        };
      });

      mm.add('(prefers-reduced-motion: reduce)', () => {
        timelineRef.current = null;
        gsap.set([trPrimary, trSecondary, blPrimary, blSecondary], {
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
          opacity: 1,
        });
      });
    }, containerRef);

    return () => {
      timelineRef.current = null;
      ctx.revert();
    };
  }, []);

  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.paused(isPaused);
    }
  }, [isPaused]);

  return (
    <>
      <div
        ref={containerRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 select-none overflow-hidden"
      >
        <div
          ref={trPrimaryRef}
          className="absolute -right-[10%] -top-[14%] h-[360px] w-[360px] sm:h-[540px] sm:w-[540px] rounded-[46%_54%_52%_48%/48%_44%_56%_52%] will-change-transform"
          style={{
            background:
              'radial-gradient(circle at 65% 35%, rgba(204, 0, 0, 0.24) 0%, rgba(225, 29, 72, 0.14) 38%, rgba(254, 205, 211, 0.08) 64%, rgba(255, 255, 255, 0) 80%)',
          }}
        />
        <div
          ref={trSecondaryRef}
          className="absolute -right-[6%] -top-[10%] h-[300px] w-[330px] sm:h-[440px] sm:w-[480px] rounded-[55%_45%_40%_60%/52%_58%_42%_48%] will-change-transform"
          style={{
            background:
              'radial-gradient(ellipse at 70% 30%, rgba(225, 29, 72, 0.18) 0%, rgba(251, 113, 133, 0.09) 44%, rgba(255, 255, 255, 0) 76%)',
          }}
        />

        <div
          ref={blPrimaryRef}
          className="absolute -bottom-[16%] -left-[10%] h-[380px] w-[380px] sm:h-[560px] sm:w-[560px] rounded-[52%_48%_44%_56%/54%_46%_54%_46%] will-change-transform"
          style={{
            background:
              'radial-gradient(circle at 35% 65%, rgba(204, 0, 0, 0.22) 0%, rgba(225, 29, 72, 0.13) 38%, rgba(254, 205, 211, 0.07) 64%, rgba(255, 255, 255, 0) 80%)',
          }}
        />
        <div
          ref={blSecondaryRef}
          className="absolute -bottom-[12%] -left-[6%] h-[310px] w-[350px] sm:h-[450px] sm:w-[500px] rounded-[42%_58%_55%_45%/46%_54%_46%_54%] will-change-transform"
          style={{
            background:
              'radial-gradient(ellipse at 30% 70%, rgba(225, 29, 72, 0.16) 0%, rgba(251, 113, 133, 0.08) 44%, rgba(255, 255, 255, 0) 76%)',
          }}
        />
      </div>

      {!prefersReducedMotion && (
        <button
          type="button"
          onClick={() => setIsPaused((prev) => !prev)}
          aria-pressed={isPaused}
          aria-label={isPaused ? 'Jalankan animasi latar' : 'Jeda animasi latar'}
          title="Jeda / jalankan animasi latar"
          className="fixed bottom-4 right-4 z-30 flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-colors hover:border-[#CC0000]/50 hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
        >
          {isPaused ? (
            <Play size={18} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Pause size={18} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
      )}
    </>
  );
}
