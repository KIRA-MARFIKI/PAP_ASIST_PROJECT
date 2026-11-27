import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { CloudDownload, FileClock, KeyRound, LogOut, Pencil, Upload, X } from 'lucide-react';
import {
  EnrichBatchResult,
  PartItem,
  SinglePartUpdatePayload,
  StockStatus,
} from '../types/part';
import { formatRupiah, getStockStatus, normalizePartCodeKey } from '../services/partsRepository';
import { AdminSession } from './LoginModal';
import { EditPartModal } from './EditPartModal';
import { SurfaceWatermark } from './WatermarkOverlay';

type AdminTab = 'all' | 'fast' | 'slow';
type StatusFilter = 'all' | StockStatus;

interface AdminAsistPanelProps {
  isOpen: boolean;
  session: AdminSession | null;
  parts: PartItem[];
  uploadHistoryCount: number;
  onClose: () => void;
  onOpenUpload: () => void;
  onOpenHistory: () => void;
  onOpenCredentials: () => void;
  onRunEnrichBatch: () => Promise<EnrichBatchResult>;
  onSaveSinglePart: (payload: SinglePartUpdatePayload) => Promise<void>;
  onLogout: () => void;
}

function getStockStatusBadge(status: StockStatus): { label: string; className: string } {
  if (status === 'unavailable') {
    return {
      label: 'Tidak Tersedia',
      className: 'border-[#CC0000]/35 bg-[#FEF2F2] text-[#CC0000]',
    };
  }
  if (status === 'critical') {
    return {
      label: 'Kritis',
      className: 'border-[#92400E]/35 bg-[#FFFBEB] text-[#92400E]',
    };
  }
  if (status === 'unknown') {
    return {
      label: 'Belum Diatur',
      className: 'border-[#52525B]/30 bg-[#F4F4F5] text-[#3F3F46]',
    };
  }
  return {
    label: 'Tersedia',
    className: 'border-[#166534]/30 bg-[#F0FDF4] text-[#166534]',
  };
}

export function AdminAsistPanel({
  isOpen,
  session,
  parts,
  uploadHistoryCount,
  onClose,
  onOpenUpload,
  onOpenHistory,
  onOpenCredentials,
  onRunEnrichBatch,
  onSaveSinglePart,
  onLogout,
}: AdminAsistPanelProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('all');
  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editingPart, setEditingPart] = useState<PartItem | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichFeedback, setEnrichFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const tabIndicatorRef = useRef<HTMLDivElement>(null);
  const allTabRef = useRef<HTMLButtonElement>(null);
  const fastTabRef = useRef<HTMLButtonElement>(null);
  const slowTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
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
      gsap.fromTo(panel, { x: '100%' }, { x: '0%', duration: 0.3, ease: 'power3.out' });
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(backdrop, { opacity: 1 });
      gsap.set(panel, { x: '0%' });
    });

    return () => mm.revert();
  }, [isOpen]);

  useEffect(() => {
    if (!enrichFeedback || !feedbackRef.current) return;
    const el = feedbackRef.current;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(el, { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' });
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(el, { opacity: 1, y: 0 });
    });

    return () => mm.revert();
  }, [enrichFeedback]);

  useEffect(() => {
    if (!isOpen) return;

    const updateIndicator = (animate: boolean) => {
      const indicator = tabIndicatorRef.current;
      const targetBtn =
        activeTab === 'all'
          ? allTabRef.current
          : activeTab === 'fast'
            ? fastTabRef.current
            : slowTabRef.current;
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

  const summary = useMemo(() => {
    let fastCount = 0;
    let slowCount = 0;
    let criticalCount = 0;
    let missingPriceCount = 0;
    let pendingEnrichCount = 0;

    for (const part of parts) {
      if (part.kategori === 'fast') fastCount += 1;
      else slowCount += 1;
      if (
        part.stockKnown &&
        part.stok !== null &&
        part.stokMinimum !== null &&
        part.stok < part.stokMinimum
      ) {
        criticalCount += 1;
      }
      if (part.harga === null) {
        missingPriceCount += 1;
      }
      if (!part.aiEnriched) {
        pendingEnrichCount += 1;
      }
    }

    return {
      total: parts.length,
      fast: fastCount,
      slow: slowCount,
      critical: criticalCount,
      missingPrice: missingPriceCount,
      pendingEnrich: pendingEnrichCount,
    };
  }, [parts]);

  const filteredParts = useMemo(() => {
    const keyword = filterText.trim().toLowerCase();
    const normalizedKey = normalizePartCodeKey(filterText);
    return parts.filter((part) => {
      if (activeTab !== 'all' && part.kategori !== activeTab) return false;
      const partStatus = getStockStatus(part);
      if (statusFilter !== 'all' && partStatus !== statusFilter) return false;
      if (!keyword) return true;
      return (
        part.namaResmi.toLowerCase().includes(keyword) ||
        part.kodePart.toLowerCase().includes(keyword) ||
        (normalizedKey.length >= 3 && normalizePartCodeKey(part.kodePart).includes(normalizedKey)) ||
        part.kodeRak.toLowerCase().includes(keyword) ||
        part.aliases.some((alias) => alias.toLowerCase().includes(keyword))
      );
    });
  }, [parts, activeTab, filterText, statusFilter]);

  const handleTriggerEnrich = async () => {
    if (isEnriching || summary.pendingEnrich === 0) return;
    setIsEnriching(true);
    setEnrichFeedback(null);

    try {
      const res = await onRunEnrichBatch();
      setEnrichFeedback({
        type: 'success',
        text: `Selesai memproses ${res.processed} part (${res.priceUpdated} harga referensi diperbarui, ${res.aliasesUpdated} alias AI ditambahkan). Sisa belum lengkap: ${res.remainingPending} part.`,
      });
    } catch (err) {
      setEnrichFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal melengkapi data via AI dan Honda Cengkareng. Coba lagi beberapa saat.',
      });
    } finally {
      setIsEnriching(false);
    }
  };

  if (!isOpen || !session) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex justify-end bg-black/30"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-asist-title"
    >
      <div
        ref={panelRef}
        className="relative flex h-full w-full flex-col overflow-hidden bg-white shadow-[0_0_40px_rgba(0,0,0,0.14)]"
      >
        <SurfaceWatermark variant="light" />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E4E7] pb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <h2
                  id="admin-asist-title"
                  className="text-xl sm:text-2xl font-bold text-[#18181B]"
                >
                  Admin Asist
                </h2>
                <span className="truncate text-xs sm:text-sm font-medium text-[#52525B]">
                  {session.nama}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#52525B]">
                Pengelolaan stok gudang Honda Motor Padang Panjang
              </p>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={onOpenUpload}
                aria-label="Upload Data Baru"
                title="Upload Data Baru"
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] bg-[#CC0000] text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                <Upload size={19} strokeWidth={1.75} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => {
                  void handleTriggerEnrich();
                }}
                disabled={isEnriching || summary.pendingEnrich === 0}
                aria-label="Lengkapi harga Cengkareng dan alias AI"
                title="Lengkapi Harga & Alias AI (10 part/batch)"
                className="relative flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                <CloudDownload size={19} strokeWidth={1.75} aria-hidden="true" />
                {summary.pendingEnrich > 0 && (
                  <span className="tabular-nums absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#18181B] px-1 text-[10px] font-bold leading-none text-white">
                    {summary.pendingEnrich > 99 ? '99+' : summary.pendingEnrich}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={onOpenHistory}
                aria-label={`Riwayat Upload (${uploadHistoryCount})`}
                title="Riwayat Upload"
                className="relative flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                <FileClock size={19} strokeWidth={1.75} aria-hidden="true" />
                {uploadHistoryCount > 0 && (
                  <span className="tabular-nums absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#CC0000] px-1 text-[11px] font-bold leading-none text-white">
                    {uploadHistoryCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={onOpenCredentials}
                aria-label="Ubah kredensial admin"
                title="Ubah kredensial admin"
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                <KeyRound size={19} strokeWidth={1.75} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onLogout}
                aria-label="Keluar dari Admin Asist"
                title="Keluar"
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                <LogOut size={19} strokeWidth={1.75} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup Admin Asist"
                title="Tutup"
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                <X size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-[8px] border border-[#E4E4E7] bg-white/95 px-3.5 py-2.5">
              <span className="block text-xs text-[#52525B]">Total Part</span>
              <span className="tabular-nums mt-0.5 block text-lg font-bold text-[#18181B]">
                {summary.total}
              </span>
            </div>
            <div className="rounded-[8px] border border-[#E4E4E7] bg-white/95 px-3.5 py-2.5">
              <span className="block text-xs text-[#52525B]">Fast Moving</span>
              <span className="tabular-nums mt-0.5 block text-lg font-bold text-[#18181B]">
                {summary.fast}
              </span>
            </div>
            <div className="rounded-[8px] border border-[#E4E4E7] bg-white/95 px-3.5 py-2.5">
              <span className="block text-xs text-[#52525B]">Slow Moving</span>
              <span className="tabular-nums mt-0.5 block text-lg font-bold text-[#18181B]">
                {summary.slow}
              </span>
            </div>
            <div className="rounded-[8px] border border-[#E4E4E7] bg-white/95 px-3.5 py-2.5">
              <span className="block text-xs text-[#52525B]">Stok Kritis</span>
              <span className="tabular-nums mt-0.5 block text-lg font-bold text-[#CC0000]">
                {summary.critical}
              </span>
            </div>
          </div>

          {(summary.missingPrice > 0 || isEnriching || enrichFeedback) && (
            <div className="mt-3 space-y-2">
              {summary.missingPrice > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#E4E4E7] bg-[#FAFAFA] px-3.5 py-2 text-xs text-[#3F3F46]">
                  <span className="tabular-nums">
                    {summary.missingPrice} part belum punya harga referensi ({summary.pendingEnrich}{' '}
                    part menunggu pengayaan AI &amp; Honda Cengkareng).
                  </span>
                  {isEnriching && (
                    <span className="font-semibold text-[#18181B]">
                      Memproses batch 10 part...
                    </span>
                  )}
                </div>
              )}

              {enrichFeedback && (
                <div
                  ref={feedbackRef}
                  role={enrichFeedback.type === 'error' ? 'alert' : 'status'}
                  className={`rounded-[8px] border px-3.5 py-2 text-xs font-medium ${enrichFeedback.type === 'error'
                      ? 'border-[#CC0000]/30 bg-[#FEF2F2] text-[#991B1B]'
                      : 'border-[#166534]/30 bg-[#F0FDF4] text-[#166534]'
                    }`}
                >
                  {enrichFeedback.text}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="relative inline-flex w-fit max-w-full items-center overflow-x-auto rounded-[8px] border border-[#E4E4E7] bg-[#F4F4F5] p-1">
              <div
                ref={tabIndicatorRef}
                aria-hidden="true"
                className="absolute bottom-1 top-1 left-1 rounded-[6px] bg-[#CC0000]"
                style={{ width: '76px' }}
              />
              <button
                ref={allTabRef}
                type="button"
                onClick={() => setActiveTab('all')}
                className={`relative z-10 min-h-[36px] cursor-pointer whitespace-nowrap rounded-[6px] px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000] ${activeTab === 'all' ? 'text-white' : 'text-[#52525B]'
                  }`}
              >
                Semua
              </button>
              <button
                ref={fastTabRef}
                type="button"
                onClick={() => setActiveTab('fast')}
                className={`relative z-10 min-h-[36px] cursor-pointer whitespace-nowrap rounded-[6px] px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000] ${activeTab === 'fast' ? 'text-white' : 'text-[#52525B]'
                  }`}
              >
                Fast Moving
              </button>
              <button
                ref={slowTabRef}
                type="button"
                onClick={() => setActiveTab('slow')}
                className={`relative z-10 min-h-[36px] cursor-pointer whitespace-nowrap rounded-[6px] px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000] ${activeTab === 'slow' ? 'text-white' : 'text-[#52525B]'
                  }`}
              >
                Slow Moving
              </button>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
              <div className="relative w-full sm:w-64">
                <label
                  htmlFor="admin-part-filter"
                  className="mb-1 block text-xs font-medium text-[#52525B]"
                >
                  Cari part
                </label>
                <div className="relative flex items-center">
                  <input
                    id="admin-part-filter"
                    type="text"
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    placeholder="Nama, kode part, atau rak"
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

              <div className="w-full sm:w-44">
                <label
                  htmlFor="admin-status-filter"
                  className="mb-1 block text-xs font-medium text-[#52525B]"
                >
                  Status stok
                </label>
                <select
                  id="admin-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="min-h-[44px] w-full cursor-pointer rounded-[8px] border border-[#E4E4E7] bg-white px-3 text-sm text-[#18181B] focus:border-[#CC0000] focus:outline-none"
                >
                  <option value="all">Semua Status</option>
                  <option value="available">Tersedia</option>
                  <option value="critical">Kritis</option>
                  <option value="unavailable">Tidak Tersedia</option>
                  <option value="unknown">Belum Diatur</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 flex-1 overflow-auto rounded-[8px] border border-[#E4E4E7] bg-white/95">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-[#E4E4E7] bg-[#F8FAFC] text-xs font-semibold text-[#52525B]">
                <tr>
                  <th className="px-4 py-3">Foto</th>
                  <th className="px-4 py-3">Nama Resmi Part</th>
                  <th className="px-4 py-3">Kode Part</th>
                  <th className="px-4 py-3">Kode Rak</th>
                  <th className="px-4 py-3">Kategori</th>
                  <th className="px-4 py-3">Harga</th>
                  <th className="px-4 py-3">Stok</th>
                  <th className="px-4 py-3">Stok Minimum</th>
                  <th className="px-4 py-3">Status Stok</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7] bg-white">
                {filteredParts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-10 text-center text-sm text-[#52525B]"
                    >
                      {parts.length === 0
                        ? 'Belum ada data part di gudang. Klik tombol Upload Data Baru di pojok kanan atas untuk mengunggah file Excel/CSV gudang.'
                        : 'Tidak ada part yang cocok dengan filter saat ini.'}
                    </td>
                  </tr>
                ) : (
                  filteredParts.map((part) => {
                    const status = getStockStatus(part);
                    const badge = getStockStatusBadge(status);

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
                          <div>{part.namaResmi}</div>
                          {part.substitutedBy && (
                            <div className="tabular-nums mt-0.5 text-[11px] font-normal text-[#52525B]">
                              Pengganti: {part.substitutedBy}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[#3F3F46]">
                          {part.kodePart}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[#3F3F46]">
                          {part.kodeRak || '-'}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold text-[#3F3F46]">
                          {part.kategori === 'fast' ? 'Fast' : 'Slow'}
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
                          className={`px-4 py-3 tabular-nums font-semibold ${status === 'critical' || status === 'unavailable'
                              ? 'text-[#CC0000]'
                              : 'text-[#18181B]'
                            }`}
                        >
                          {part.stockKnown && part.stok !== null ? part.stok : '-'}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-[#52525B]">
                          {part.stockKnown && part.stokMinimum !== null ? part.stokMinimum : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center whitespace-nowrap rounded-[6px] border px-2.5 py-1 text-xs font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setEditingPart(part)}
                            aria-label={`Edit part ${part.namaResmi}`}
                            title="Edit cepat part"
                            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                          >
                            <Pencil size={17} strokeWidth={1.75} aria-hidden="true" />
                          </button>
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

      <EditPartModal
        part={editingPart}
        onClose={() => setEditingPart(null)}
        onSave={async (payload) => {
          await onSaveSinglePart(payload);
          setEnrichFeedback({
            type: 'success',
            text: 'Data part berhasil diperbarui.',
          });
        }}
      />
    </div>
  );
}
