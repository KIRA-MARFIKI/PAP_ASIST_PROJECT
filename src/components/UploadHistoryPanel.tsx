import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { UploadHistoryRecord } from '../types/part';
import { SurfaceWatermark } from './WatermarkOverlay';

interface UploadHistoryPanelProps {
  isOpen: boolean;
  records: UploadHistoryRecord[];
  storageError?: string;
  onClose: () => void;
}

function formatWibTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    const formatted = new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta',
    }).format(date);
    return `${formatted} WIB`;
  } catch {
    return isoString;
  }
}

function getStatusBadge(status: UploadHistoryRecord['status']): {
  label: string;
  className: string;
} {
  if (status === 'success') {
    return {
      label: 'Berhasil',
      className: 'border-[#166534]/30 bg-[#F0FDF4] text-[#166534]',
    };
  }
  if (status === 'partial') {
    return {
      label: 'Sebagian Gagal',
      className: 'border-[#92400E]/30 bg-[#FFFBEB] text-[#92400E]',
    };
  }
  return {
    label: 'Gagal',
    className: 'border-[#CC0000]/30 bg-[#FEF2F2] text-[#CC0000]',
  };
}

export function UploadHistoryPanel({
  isOpen,
  records,
  storageError,
  onClose,
}: UploadHistoryPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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
    if (!isOpen) return;
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!backdrop || !panel) return;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' });
      gsap.fromTo(panel, { x: '100%' }, { x: '0%', duration: 0.28, ease: 'power3.out' });
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(backdrop, { opacity: 1 });
      gsap.set(panel, { x: '0%' });
    });

    return () => mm.revert();
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      ref={backdropRef}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      className="fixed inset-0 z-[60] flex justify-end bg-black/35"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-history-title"
    >
      <div
        ref={panelRef}
        className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-[0_0_40px_rgba(0,0,0,0.16)]"
      >
        <SurfaceWatermark variant="light" />

        <div className="relative z-10 flex h-full flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#E4E4E7] px-4 py-3.5 sm:px-6">
            <div>
              <h2 id="upload-history-title" className="text-base sm:text-lg font-bold text-[#18181B]">
                Riwayat Upload
              </h2>
              <p className="text-xs text-[#52525B]">
                Catatan impor data gudang Honda Motor Padang Panjang
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup Riwayat Upload"
              title="Tutup Riwayat Upload"
              className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {storageError && (
              <div
                role="alert"
                className="mb-4 rounded-[8px] border border-[#CC0000]/30 bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]"
              >
                {storageError}
              </div>
            )}

            {records.length === 0 ? (
              <div className="rounded-[8px] border border-[#E4E4E7] bg-white/95 px-6 py-12 text-center text-sm text-[#52525B]">
                Belum ada riwayat upload data gudang.
              </div>
            ) : (
              <ul className="space-y-3">
                {records.map((record) => {
                  const badge = getStatusBadge(record.status);
                  const isExpanded = Boolean(expandedIds[record.id]);
                  const hasErrors = record.failedCount > 0 && record.errors.length > 0;

                  return (
                    <li
                      key={record.id}
                      className="rounded-[8px] border border-[#E4E4E7] bg-white/95 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-bold text-[#18181B]">
                              {record.fileName}
                            </p>
                            <span
                              className={`inline-flex items-center rounded-[6px] border px-2 py-0.5 text-xs font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#52525B]">
                            {formatWibTimestamp(record.uploadedAt)} · Oleh {record.uploadedBy}
                          </p>
                          {record.sheetsProcessed && record.sheetsProcessed.length > 0 && (
                            <p className="mt-0.5 text-xs text-[#52525B]">
                              Sheet: {record.sheetsProcessed.join(', ')}
                            </p>
                          )}
                        </div>

                        {hasErrors && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(record.id)}
                            aria-expanded={isExpanded}
                            aria-label={
                              isExpanded
                                ? 'Sembunyikan detail baris gagal'
                                : 'Lihat detail baris gagal'
                            }
                            title={
                              isExpanded
                                ? 'Sembunyikan detail baris gagal'
                                : 'Lihat detail baris gagal'
                            }
                            className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                          >
                            {isExpanded ? (
                              <ChevronUp size={18} strokeWidth={1.75} aria-hidden="true" />
                            ) : (
                              <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
                            )}
                          </button>
                        )}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-[8px] border border-[#F4F4F5] bg-[#FAFAFA] p-2.5 text-xs sm:grid-cols-4">
                        <div>
                          <span className="block text-[#52525B]">Total Baris</span>
                          <span className="tabular-nums text-sm font-bold text-[#18181B]">
                            {record.totalRows}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[#52525B]">Berhasil</span>
                          <span className="tabular-nums text-sm font-bold text-[#166534]">
                            {record.successCount}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[#52525B]">Duplikat Digabung</span>
                          <span className="tabular-nums text-sm font-bold text-[#18181B]">
                            {record.duplicateMergedCount ?? 0}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[#52525B]">Tidak Berhasil</span>
                          <span className="tabular-nums text-sm font-bold text-[#CC0000]">
                            {record.failedCount}
                          </span>
                        </div>
                      </div>

                      {hasErrors && isExpanded && (
                        <div className="mt-3 rounded-[8px] border border-[#E4E4E7] bg-white p-3">
                          <p className="mb-2 text-xs font-semibold text-[#18181B]">
                            Detail baris tidak berhasil:
                          </p>
                          <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs text-[#3F3F46]">
                            {record.errors.map((err, idx) => (
                              <li
                                key={`${record.id}-err-${idx}`}
                                className="rounded-[6px] border border-[#F4F4F5] bg-[#FAFAFA] px-2.5 py-1.5"
                              >
                                <span className="tabular-nums font-semibold text-[#CC0000]">
                                  Baris {err.rowNumber}
                                </span>{' '}
                                <span className="tabular-nums text-[#52525B]">
                                  ({err.partCode})
                                </span>
                                : {err.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
