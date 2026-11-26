import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { History, Trash2 } from 'lucide-react';

interface SearchHistoryProps {
  items: string[];
  isOpen: boolean;
  onSelect: (query: string) => void;
  onClear: () => void;
}

export function SearchHistory({ items, isOpen, onSelect, onClear }: SearchHistoryProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dropdownRef.current;
    if (!el || !isOpen) return;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        el,
        { opacity: 0, y: -6 },
        { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out' }
      );
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(el, { opacity: 1, y: 0 });
    });

    return () => mm.revert();
  }, [isOpen]);

  if (!isOpen || items.length === 0) {
    return null;
  }

  return (
    <div
      ref={dropdownRef}
      role="listbox"
      aria-label="Riwayat pencarian"
      className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-[8px] border border-[#E4E4E7] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
    >
      <ul className="divide-y divide-[#F4F4F5]">
        {items.map((item) => (
          <li key={item}>
            <button
              type="button"
              onMouseDown={(e) => {
                // Mencegah input blur sebelum klik item riwayat diproses
                e.preventDefault();
                onSelect(item);
              }}
              className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 px-4 py-2 text-left text-sm text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#CC0000]"
            >
              <History size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-[#52525B]" />
              <span className="truncate">{item}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end border-t border-[#E4E4E7] bg-white px-2 py-1">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onClear();
          }}
          aria-label="Hapus riwayat pencarian"
          title="Hapus riwayat pencarian"
          className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] text-[#CC0000] transition-colors hover:bg-[#FEF2F2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
        >
          <Trash2 size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
