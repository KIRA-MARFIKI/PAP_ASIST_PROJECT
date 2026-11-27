import { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface SearchLoadingStateProps {
  mode: 'text' | 'image' | 'category';
}

export function SearchLoadingState({ mode }: SearchLoadingStateProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    const bar = barRef.current;
    if (!card || !bar) return;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        card,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.24, ease: 'power2.out' }
      );
      gsap.fromTo(
        bar,
        { xPercent: -100 },
        {
          xPercent: 320,
          duration: 1.25,
          ease: 'power1.inOut',
          repeat: -1,
        }
      );
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(card, { opacity: 1, y: 0 });
      gsap.set(bar, { xPercent: 0, width: '60%' });
    });

    return () => mm.revert();
  }, []);

  return (
    <div
      ref={cardRef}
      role="status"
      aria-live="polite"
      className="my-4 rounded-[8px] border border-[#E4E4E7] bg-white p-5"
    >
      <div className="flex items-center gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-[#FAFAFA]">
          <img
            src="/PAP10.webp"
            alt=""
            aria-hidden="true"
            width={1696}
            height={2528}
            className="h-7 w-auto object-contain mix-blend-multiply"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#18181B]">
            {mode === 'category'
              ? 'Memuat suku cadang kategori...'
              : 'AI sedang mencari nama resmi part...'}
          </p>
          <p className="mt-0.5 text-xs text-[#52525B]">
            {mode === 'category'
              ? 'Mengambil data kategori dari katalog Honda Cengkareng dan gudang Padang Panjang...'
              : mode === 'image'
                ? 'Mengenali foto part lalu mencocokkan data gudang Padang Panjang dan katalog Honda Cengkareng'
                : 'Mengecek data gudang Padang Panjang dan katalog Honda Cengkareng'}
          </p>
        </div>
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#F4F4F5]">
        <div
          ref={barRef}
          className="h-full w-1/3 rounded-full bg-[#CC0000]"
        />
      </div>
    </div>
  );
}
