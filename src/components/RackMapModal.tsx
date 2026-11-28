import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { X } from 'lucide-react';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { PartItem } from '../types/part';
import {
  ACCESSORY_APPAREL_RACKS,
  RackZone,
  resolveAccessoryApparelRack,
} from '../utils/rackRules';
import { SurfaceWatermark } from './WatermarkOverlay';

interface RackMapModalProps {
  isOpen: boolean;
  parts: PartItem[];
  onClose: () => void;
}

type ZoneTabId = 'all' | RackZone;

const ZONE_TABS: readonly { id: ZoneTabId; label: string }[] = [
  { id: 'all', label: 'Semua Zona' },
  { id: 'wall_display', label: 'Wall Display' },
  { id: 'etalase', label: 'Etalase Pajangan' },
  { id: 'aquarium', label: 'Aquarium Part' },
  { id: 'ruang_b', label: 'Ruang B' },
];

export function RackMapModal({ isOpen, parts, onClose }: RackMapModalProps) {
  const [activeZone, setActiveZone] = useState<ZoneTabId>('all');
  const [testInput, setTestInput] = useState('');

  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tabIndicatorRef = useRef<HTMLDivElement>(null);
  const tabBtnRefs = useRef<Partial<Record<ZoneTabId, HTMLButtonElement | null>>>({});

  const shouldRender = useAnimatedPresence(isOpen, backdropRef, dialogRef);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!shouldRender || !isOpen) return;

    const updateIndicator = (animate: boolean) => {
      const indicator = tabIndicatorRef.current;
      const targetBtn = tabBtnRefs.current[activeZone];
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
  }, [activeZone, isOpen, shouldRender]);

  const countByRackCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const part of parts) {
      const code = (part.kodeRak || '').trim();
      if (!code || code === '-') continue;
      map.set(code, (map.get(code) ?? 0) + 1);
    }
    return map;
  }, [parts]);

  const testResult = useMemo(() => {
    const trimmed = testInput.trim();
    if (!trimmed) return null;
    return resolveAccessoryApparelRack({
      partCode: trimmed,
      officialName: trimmed,
      userQuery: trimmed,
    });
  }, [testInput]);

  const zonesData = useMemo(() => {
    return {
      wallDisplay: ACCESSORY_APPAREL_RACKS.filter((r) => r.zone === 'wall_display'),
      etalase: ACCESSORY_APPAREL_RACKS.filter((r) => r.zone === 'etalase'),
      aquarium: ACCESSORY_APPAREL_RACKS.filter((r) => r.zone === 'aquarium'),
      ruangB1: ACCESSORY_APPAREL_RACKS.filter((r) => r.aisle === 'B-01'),
      ruangB2: ACCESSORY_APPAREL_RACKS.filter((r) => r.aisle === 'B-02'),
    };
  }, []);

  if (!shouldRender) return null;

  const showZone = (zone: RackZone) => activeZone === 'all' || activeZone === zone;

  return (
    <div
      ref={backdropRef}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rack-map-modal-title"
    >
      <div
        ref={dialogRef}
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[8px] border border-[#E4E4E7] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.18)]"
      >
        <SurfaceWatermark variant="light" />

        <div className="relative z-10 flex h-full max-h-[92vh] flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-[#E4E4E7] px-4 py-3.5 sm:px-6">
            <div className="min-w-0">
              <h2 id="rack-map-modal-title" className="text-base sm:text-lg font-bold text-[#18181B]">
                Peta Rak Aksesoris &amp; Apparel
              </h2>
              <p className="mt-0.5 text-xs text-[#52525B]">
                22 kode rak standar lintas 4 zona gudang Honda Motor Padang Panjang
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Peta Rak Aksesoris dan Apparel"
              title="Tutup"
              className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="rounded-[8px] border border-[#E4E4E7] bg-[#FAFAFA] px-3.5 py-2.5 text-xs leading-relaxed text-[#3F3F46]">
              Pemetaan kode rak khusus Aksesoris &amp; Apparel. Ruang B dibagi{' '}
              <span className="tabular-nums font-semibold text-[#18181B]">B-01-001</span> sampai{' '}
              <span className="tabular-nums font-semibold text-[#18181B]">B-01-008</span> dan{' '}
              <span className="tabular-nums font-semibold text-[#18181B]">B-02-001</span> sampai{' '}
              <span className="tabular-nums font-semibold text-[#18181B]">B-02-008</span>.
            </div>

            <div className="rounded-[8px] border border-[#E4E4E7] bg-white/95 p-3.5">
              <label
                htmlFor="rack-rule-tester-input"
                className="mb-1.5 block text-xs font-semibold text-[#18181B]"
              >
                Uji Aturan Kode Rak
              </label>
              <div className="relative flex items-center">
                <input
                  id="rack-rule-tester-input"
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder="Ketik kode part atau nama item (mis. 0800A-K1A-N00, jaket honda, helm trx, poct, dompet, garnish vario 160)"
                  className="min-h-[44px] w-full rounded-[8px] border border-[#D4D4D8] bg-white pl-3.5 pr-11 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                />
                {testInput && (
                  <button
                    type="button"
                    onClick={() => setTestInput('')}
                    aria-label="Hapus teks uji aturan rak"
                    title="Hapus teks uji"
                    className="absolute right-0 flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center text-[#52525B] hover:text-[#18181B] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                  >
                    <X size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
              </div>

              {testResult && (
                <div
                  role="status"
                  className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-[6px] border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 text-xs"
                >
                  {testResult.suggestedRackCode ? (
                    <>
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tabular-nums font-bold text-[#CC0000]">
                            {testResult.suggestedRackCode}
                          </span>
                          <span className="rounded-[5px] border border-[#D4D4D8] bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[#18181B]">
                            {testResult.zoneLabel}
                          </span>
                        </div>
                        <p className="text-[#52525B]">{testResult.matchedRule}</p>
                      </div>
                      <span className="rounded-[5px] border border-[#E4E4E7] bg-white px-2 py-0.5 text-[11px] font-semibold uppercase text-[#3F3F46]">
                        {testResult.itemGroup}
                      </span>
                    </>
                  ) : (
                    <p className="text-[#52525B]">
                      Tidak cocok dengan 6 aturan Aksesoris &amp; Apparel (diklasifikasikan sebagai{' '}
                      <span className="font-semibold text-[#18181B]">sparepart</span> standar).
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="relative inline-flex w-fit max-w-full items-center overflow-x-auto rounded-[8px] border border-[#E4E4E7] bg-[#F4F4F5] p-1">
              <div
                ref={tabIndicatorRef}
                aria-hidden="true"
                className="absolute bottom-1 top-1 left-1 rounded-[6px] bg-[#CC0000]"
                style={{ width: '96px' }}
              />
              {ZONE_TABS.map((tab) => (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabBtnRefs.current[tab.id] = el;
                  }}
                  type="button"
                  onClick={() => setActiveZone(tab.id)}
                  className={`relative z-10 min-h-[36px] cursor-pointer whitespace-nowrap rounded-[6px] px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000] ${
                    activeZone === tab.id ? 'text-white' : 'text-[#52525B]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {showZone('wall_display') && (
                <section className="rounded-[8px] border border-[#E4E4E7] bg-white/95 p-4">
                  <h3 className="text-sm font-bold text-[#18181B]">Wall Display</h3>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {zonesData.wallDisplay.map((rack) => {
                      const count = countByRackCode.get(rack.rackCode) ?? 0;
                      return (
                        <div
                          key={rack.rackCode}
                          className="rounded-[8px] border border-[#E4E4E7] bg-[#FAFAFA] p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-[#18181B]">
                              {rack.rackCode}
                            </span>
                            <span className="tabular-nums rounded-[6px] border border-[#E4E4E7] bg-white px-2 py-0.5 text-xs font-semibold text-[#3F3F46]">
                              {count} item
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-[#52525B]">
                            {rack.allowedItemsSummary}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {showZone('etalase') && (
                <section className="rounded-[8px] border border-[#E4E4E7] bg-white/95 p-4">
                  <h3 className="text-sm font-bold text-[#18181B]">Etalase Pajangan</h3>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {zonesData.etalase.map((rack) => {
                      const count = countByRackCode.get(rack.rackCode) ?? 0;
                      return (
                        <div
                          key={rack.rackCode}
                          className="rounded-[8px] border border-[#E4E4E7] bg-[#FAFAFA] p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-[#18181B]">
                              {rack.rackCode}
                            </span>
                            <span className="tabular-nums rounded-[6px] border border-[#E4E4E7] bg-white px-2 py-0.5 text-xs font-semibold text-[#3F3F46]">
                              {count} item
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-[#52525B]">
                            {rack.allowedItemsSummary}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {showZone('aquarium') && (
                <section className="rounded-[8px] border border-[#E4E4E7] bg-white/95 p-4">
                  <h3 className="text-sm font-bold text-[#18181B]">Aquarium Part</h3>
                  <div className="mt-3">
                    {zonesData.aquarium.map((rack) => {
                      const count = countByRackCode.get(rack.rackCode) ?? 0;
                      return (
                        <div
                          key={rack.rackCode}
                          className="rounded-[8px] border border-[#CC0000]/25 bg-[#FEF2F2]/40 p-3.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-[#18181B]">
                                {rack.rackCode}
                              </span>
                              <span className="tabular-nums rounded-[6px] border border-[#CC0000]/30 bg-white px-2 py-0.5 text-[11px] font-bold text-[#CC0000]">
                                Prefix 0800A
                              </span>
                            </div>
                            <span className="tabular-nums rounded-[6px] border border-[#E4E4E7] bg-white px-2 py-0.5 text-xs font-semibold text-[#3F3F46]">
                              {count} item
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-[#52525B]">
                            {rack.allowedItemsSummary}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {showZone('ruang_b') && (
                <section className="rounded-[8px] border border-[#E4E4E7] bg-white/95 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#18181B]">
                      Ruang B (16 Slot Aksesoris Motor)
                    </h3>
                    <span className="text-xs text-[#52525B]">
                      Baris B-01 (8 slot) &amp; Baris B-02 (8 slot)
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-[8px] border border-[#E4E4E7] bg-[#FAFAFA] p-3">
                      <p className="tabular-nums text-xs font-bold text-[#18181B]">
                        Baris B-01 (B-01-001 s.d. B-01-008)
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#52525B]">
                        Garnish, visor, windshield, tank pad, side pad, dan aksesoris bodi non-0800A
                      </p>
                      <div className="mt-2.5 grid grid-cols-2 gap-2">
                        {zonesData.ruangB1.map((rack) => {
                          const count = countByRackCode.get(rack.rackCode) ?? 0;
                          return (
                            <div
                              key={rack.rackCode}
                              className="flex items-center justify-between rounded-[6px] border border-[#E4E4E7] bg-white px-2.5 py-2"
                            >
                              <span className="tabular-nums text-xs font-bold text-[#18181B]">
                                {rack.rackCode}
                              </span>
                              <span className="tabular-nums text-[11px] font-medium text-[#52525B]">
                                {count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-[8px] border border-[#E4E4E7] bg-[#FAFAFA] p-3">
                      <p className="tabular-nums text-xs font-bold text-[#18181B]">
                        Baris B-02 (B-02-001 s.d. B-02-008)
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#52525B]">
                        Step floor, karpet, seat cover, rear carrier, top box, crash bar, hand guard
                      </p>
                      <div className="mt-2.5 grid grid-cols-2 gap-2">
                        {zonesData.ruangB2.map((rack) => {
                          const count = countByRackCode.get(rack.rackCode) ?? 0;
                          return (
                            <div
                              key={rack.rackCode}
                              className="flex items-center justify-between rounded-[6px] border border-[#E4E4E7] bg-white px-2.5 py-2"
                            >
                              <span className="tabular-nums text-xs font-bold text-[#18181B]">
                                {rack.rackCode}
                              </span>
                              <span className="tabular-nums text-[11px] font-medium text-[#52525B]">
                                {count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
