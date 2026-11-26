import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { X } from 'lucide-react';
import { PartCategory, PartItem } from '../types/part';
import { formatRupiah, normalizePartCodeKey } from '../services/partsRepository';
import { SurfaceWatermark } from './WatermarkOverlay';

interface PartsTablePanelProps {
  isOpen: boolean;
  parts: PartItem[];
  onClose: () => void;
}

export function PartsTablePanel({ isOpen, parts, onClose }: PartsTablePanelProps) {
  const [activeTab, setActiveTab] = useState<PartCategory>('fast');
  const [filterText, setFilterText] = useState('');

  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tabIndicatorRef = useRef<HTMLDivElement>(null);
  const fastTabRef = useRef<HTMLButtonElement>(null);
  const slowTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!isOpen || !panel || !backdrop) return;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power2.out' });
      gsap.fromTo(
        panel,
        { x: '100%' },
        { x: '0%', duration: 0.3, ease: 'power3.out' }
      );
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(backdrop, { opacity: 1 });
      gsap.set(panel, { x: '0%' });
    });

    return () => mm.revert();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const updateIndicator = (animate: boolean) => {
      const indicator = tabIndicatorRef.current;
      const targetBtn = activeTab === 'fast' ? fastTabRef.current : slowTabRef.current;
      if (!indicator || !targetBtn) return;

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      gsap.killTweensOf(indicator);
      if (!animate || reduceMotion) {
        gsap.set(indicator, {
          x: targetBtn.offsetLeft - 4,
          width: targetBtn.offsetWidth,
        });
      } else {
        gsap.to(indicator, {
          x: targetBtn.offsetLeft - 4,
          width: targetBtn.offsetWidth,
          duration: 0.24,
          ease: 'power2.out',
        });
      }
    };

    updateIndicator(true);
    const handleResize = () => updateIndicator(false);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (tabIndicatorRef.current) {
        gsap.killTweensOf(tabIndicatorRef.current);
      }
    };
  }, [activeTab, isOpen]);

  const filteredParts = useMemo(() => {
    const keyword = filterText.trim().toLowerCase();
    const normalizedKey = normalizePartCodeKey(filterText);
    return parts.filter((part) => {
      if (part.kategori !== activeTab) return false;
      if (!keyword) return true;
      return (
        part.namaResmi.toLowerCase().includes(keyword) ||
        part.kodePart.toLowerCase().includes(keyword) ||
        (normalizedKey.length >= 3 && normalizePartCodeKey(part.kodePart).includes(normalizedKey)) ||
        part.kodeRak.toLowerCase().includes(keyword) ||
        part.aliases.some((alias) => alias.toLowerCase().includes(keyword))
      );
    });
  }, [parts, activeTab, filterText]);

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex justify-end bg-black/25"
      role="dialog"
      aria-modal="true"
      aria-label="Daftar part gudang"
    >
      <div
        ref={panelRef}
        className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-[0_0_40px_rgba(0,0,0,0.12)]"
      >
        <SurfaceWatermark variant="light" />
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex items-start justify-between border-b border-[#E4E4E7] pb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#18181B]">
                Daftar part
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-[#52525B]">
                Gudang Honda Motor Padang Panjang
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Daftar Part"
              title="Tutup Daftar Part"
              className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="relative inline-flex w-fit items-center rounded-[8px] border border-[#E4E4E7] bg-[#F4F4F5] p-1">
              <div
                ref={tabIndicatorRef}
                aria-hidden="true"
                className="absolute bottom-1 top-1 left-1 rounded-[6px] bg-[#CC0000]"
                style={{ width: '112px' }}
              />
              <button
                ref={fastTabRef}
                type="button"
                onClick={() => setActiveTab('fast')}
                className={`relative z-10 min-h-[36px] cursor-pointer rounded-[6px] px-4 py-1.5 text-xs sm:text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000] ${
                  activeTab === 'fast' ? 'text-white' : 'text-[#52525B]'
                }`}
              >
                Fast Moving
              </button>
              <button
                ref={slowTabRef}
                type="button"
                onClick={() => setActiveTab('slow')}
                className={`relative z-10 min-h-[36px] cursor-pointer rounded-[6px] px-4 py-1.5 text-xs sm:text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000] ${
                  activeTab === 'slow' ? 'text-white' : 'text-[#52525B]'
                }`}
              >
                Slow Moving
              </button>
            </div>

            <div className="w-full sm:flex-1 sm:max-w-md">
              <label
                htmlFor="table-part-filter"
                className="mb-1.5 block text-xs font-medium text-[#52525B]"
              >
                Filter part
              </label>
              <div className="relative flex items-center">
                <input
                  id="table-part-filter"
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Cari nama, kode, atau rak"
                  className="min-h-[44px] w-full rounded-[8px] border border-[#E4E4E7] bg-white pl-3.5 pr-11 text-sm text-[#18181B] placeholder:text-[#71717A] focus:border-[#CC0000] focus:outline-none"
                />
                {filterText && (
                  <button
                    type="button"
                    onClick={() => setFilterText('')}
                    aria-label="Hapus teks filter"
                    title="Hapus teks filter"
                    className="absolute right-0 flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center text-[#52525B] hover:text-[#18181B] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                  >
                    <X size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex-1 overflow-auto rounded-[8px] border border-[#E4E4E7] bg-white/95">
            <table className="w-full min-w-[740px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-[#E4E4E7] bg-[#F8FAFC] text-xs font-semibold text-[#52525B]">
                <tr>
                  <th className="px-4 py-3">Foto</th>
                  <th className="px-4 py-3">Nama part</th>
                  <th className="px-4 py-3">Kode part</th>
                  <th className="px-4 py-3">Kode rak</th>
                  <th className="px-4 py-3">Harga</th>
                  <th className="px-4 py-3">Stok</th>
                  <th className="px-4 py-3">Stok minimum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] bg-white">
                {filteredParts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-10 text-center text-sm text-[#52525B]"
                    >
                      Tidak ada part yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredParts.map((part) => {
                    const isLowStock =
                      part.stockKnown &&
                      part.stok !== null &&
                      part.stokMinimum !== null &&
                      part.stok < part.stokMinimum;
                    return (
                      <tr key={part.id} className="hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3">
                          <div className="relative h-12 w-12 overflow-hidden rounded-[8px] border border-[#E4E4E7] bg-[#F4F4F5]">
                            <img
                              src={part.foto}
                              alt={part.namaResmi}
                              className="h-full w-full object-cover"
                            />
                            <SurfaceWatermark variant="compact" />
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#18181B]">
                          {part.namaResmi}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[#3F3F46]">
                          {part.kodePart}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[#3F3F46]">
                          {part.kodeRak || '-'}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[#18181B]">
                          {part.harga !== null ? (
                            <div className="space-y-0.5">
                              <span className="block font-bold">{formatRupiah(part.harga)}</span>
                              {part.priceSource === 'cengkareng' && (
                                <span className="block text-[11px] font-medium text-[#52525B]">
                                  Harga dari katalog hondacengkareng.com
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-[#52525B]">
                              Harga belum tersedia
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-4 py-3 tabular-nums font-semibold ${
                            isLowStock ? 'text-[#CC0000]' : 'text-[#18181B]'
                          }`}
                        >
                          {part.stockKnown && part.stok !== null ? part.stok : '-'}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[#52525B]">
                          {part.stockKnown && part.stokMinimum !== null ? part.stokMinimum : '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
