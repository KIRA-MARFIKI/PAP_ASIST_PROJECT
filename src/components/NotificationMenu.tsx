import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Bell } from 'lucide-react';
import { PartItem } from '../types/part';

interface NotificationMenuProps {
  fastParts: PartItem[];
  slowParts: PartItem[];
  totalCount: number;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onSelectPart: (part: PartItem) => void;
}

export function NotificationMenu({
  fastParts,
  slowParts,
  totalCount,
  isOpen,
  onToggle,
  onClose,
  onSelectPart,
}: NotificationMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const prevCountRef = useRef<number>(totalCount);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  useEffect(() => {
    const el = dropdownRef.current;
    if (!el || !isOpen) return;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        el,
        { opacity: 0, y: -8 },
        { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' }
      );
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(el, { opacity: 1, y: 0 });
    });

    return () => mm.revert();
  }, [isOpen]);

  useEffect(() => {
    if (prevCountRef.current === totalCount) return;
    prevCountRef.current = totalCount;

    const badge = badgeRef.current;
    if (!badge) return;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(
        badge,
        { scale: 1.25 },
        { scale: 1, duration: 0.25, ease: 'power2.out' }
      );
    });
    return () => mm.revert();
  }, [totalCount]);

  const renderGroup = (title: string, items: PartItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="py-1.5">
        <div className="px-4 py-1 text-xs font-medium text-[#71717A]">{title}</div>
        <ul>
          {items.map((part) => (
            <li key={part.id}>
              <button
                type="button"
                onClick={() => onSelectPart(part)}
                className="w-full cursor-pointer px-4 py-2 text-left transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#CC0000]"
              >
                <div className="text-xs sm:text-sm font-bold text-[#18181B]">
                  {part.namaResmi}
                </div>
                <div className="mt-0.5 text-xs text-[#52525B] tabular-nums">
                  {part.kodePart}
                </div>
                <div className="mt-0.5 text-xs text-[#71717A] tabular-nums">
                  Stok {part.stok} · Minimum {part.stokMinimum}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Notifikasi stok menipis (${totalCount})`}
        title={`Notifikasi stok menipis (${totalCount})`}
        aria-expanded={isOpen}
        className="relative flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
      >
        <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
        {totalCount > 0 && (
          <span
            ref={badgeRef}
            className="tabular-nums absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#CC0000] px-1 text-[11px] font-bold leading-none text-white"
          >
            {totalCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          role="dialog"
          aria-label="Daftar part stok menipis"
          className="absolute right-0 top-full z-40 mt-2 w-[310px] sm:w-[340px] max-h-[75vh] overflow-y-auto rounded-[8px] border border-[#E4E4E7] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.1)]"
        >
          <div className="border-b border-[#F4F4F5] px-4 py-3">
            <h3 className="text-sm font-bold text-[#18181B]">Stok menipis</h3>
          </div>

          {totalCount === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[#71717A]">
              Semua stok di atas batas minimum.
            </div>
          ) : (
            <div className="divide-y divide-[#E4E4E7]">
              {renderGroup('Fast Moving', fastParts)}
              {renderGroup('Slow Moving', slowParts)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
