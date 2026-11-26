import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ChevronDown, ChevronUp, Download, FileClock, Upload, X } from 'lucide-react';
import { WarehouseParseResult } from '../types/part';
import {
  downloadWarehouseTemplateCsv,
  parseWarehouseFile,
} from '../utils/warehouseUploadParser';
import { SurfaceWatermark } from './WatermarkOverlay';

interface UploadDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProcessUpload: (
    fileName: string,
    parsed: WarehouseParseResult
  ) => Promise<{ storageError?: string }>;
  onOpenHistory: () => void;
}

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

export function UploadDataModal({
  isOpen,
  onClose,
  onProcessUpload,
  onOpenHistory,
}: UploadDataModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewParsed, setPreviewParsed] = useState<WarehouseParseResult | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fileError, setFileError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [savedSummary, setSavedSummary] = useState<{
    fileName: string;
    parsed: WarehouseParseResult;
  } | null>(null);
  const [showFailedDetail, setShowFailedDetail] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isClosingRef = useRef(false);

  const isBusy = isParsing || isSaving;

  const handleClose = useCallback(() => {
    if (isClosingRef.current || isBusy) return;
    isClosingRef.current = true;

    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    if (!backdrop || !dialog) {
      isClosingRef.current = false;
      onClose();
      return;
    }

    const mm = gsap.matchMedia();
    let handled = false;
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      handled = true;
      gsap.to(backdrop, { opacity: 0, duration: 0.16, ease: 'power2.in' });
      gsap.to(dialog, {
        opacity: 0,
        y: 8,
        duration: 0.16,
        ease: 'power2.in',
        onComplete: () => {
          isClosingRef.current = false;
          mm.revert();
          onClose();
        },
      });
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      handled = true;
      isClosingRef.current = false;
      mm.revert();
      onClose();
    });

    if (!handled) {
      isClosingRef.current = false;
      mm.revert();
      onClose();
    }
  }, [isBusy, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    isClosingRef.current = false;
    setSelectedFile(null);
    setPreviewParsed(null);
    setFileError('');
    setStorageWarning('');
    setSavedSummary(null);
    setShowFailedDetail(false);
    setIsDragging(false);
    setIsParsing(false);
    setIsSaving(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    if (!backdrop || !dialog) return;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' });
      gsap.fromTo(
        dialog,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' }
      );
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(backdrop, { opacity: 1 });
      gsap.set(dialog, { opacity: 1, y: 0 });
    });

    return () => mm.revert();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleClose]);

  const acceptAndParseFile = async (file: File) => {
    const lowerName = file.name.toLowerCase();
    const isValidExt = ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!isValidExt) {
      setFileError('Format file tidak didukung. Pilih file .xlsx, .xls, atau .csv.');
      setSelectedFile(null);
      setPreviewParsed(null);
      return;
    }

    setFileError('');
    setStorageWarning('');
    setSavedSummary(null);
    setShowFailedDetail(false);
    setSelectedFile(file);
    setPreviewParsed(null);
    setIsParsing(true);

    try {
      const parsed = await parseWarehouseFile(file);
      setPreviewParsed(parsed);
      setShowFailedDetail(parsed.failedRows.length > 0);
    } catch {
      setFileError(
        'Gagal membaca isi file spreadsheet. Pastikan file berisi kolom No Part dan Nama Part lalu coba lagi.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void acceptAndParseFile(file);
    }
    // Reset nilai input agar file yang sama dapat dipilih ulang.
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void acceptAndParseFile(file);
    }
  };

  const handleConfirmSave = async () => {
    if (!selectedFile || !previewParsed || isBusy) return;
    setIsSaving(true);
    setFileError('');
    setStorageWarning('');

    try {
      const outcome = await onProcessUpload(selectedFile.name, previewParsed);
      if (outcome.storageError) {
        setStorageWarning(outcome.storageError);
      }
      setSavedSummary({ fileName: selectedFile.name, parsed: previewParsed });
    } catch {
      setFileError('Gagal menyimpan data ke database gudang. Periksa koneksi lalu coba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const activeParsed = savedSummary?.parsed ?? previewParsed;
  const hasPartialColumns = Boolean(
    activeParsed &&
    (activeParsed.missingRack || activeParsed.missingPrice || activeParsed.missingStock)
  );

  return (
    <div
      ref={backdropRef}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) handleClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[8px] border border-[#E4E4E7] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
      >
        <SurfaceWatermark variant="light" />

        <div className="relative z-10">
          <div className="flex items-center justify-between border-b border-[#E4E4E7] px-5 py-3.5">
            <h2 id="upload-modal-title" className="text-base font-bold text-[#18181B]">
              Upload Data Baru
            </h2>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={downloadWarehouseTemplateCsv}
                aria-label="Unduh template CSV gudang"
                title="Unduh template CSV gudang"
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                <Download size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={handleClose}
                disabled={isBusy}
                aria-label="Tutup jendela upload"
                title="Tutup jendela upload"
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                <X size={19} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <p className="text-xs leading-relaxed text-[#52525B]">
              Mendukung file penuh maupun parsial multi-sheet Excel/CSV dengan minimal kolom{' '}
              <span className="font-semibold text-[#18181B]">No Part</span> dan{' '}
              <span className="font-semibold text-[#18181B]">Nama Part</span>. Baris kosong, header berulang, dan kode substitusi ditangani otomatis.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
              aria-hidden="true"
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`rounded-[8px] border border-dashed p-5 text-center transition-colors ${isDragging
                  ? 'border-[#CC0000] bg-[#FEF2F2]/60'
                  : 'border-[#D4D4D8] bg-white/90'
                }`}
            >
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-[#F4F4F5] text-[#18181B]">
                <Upload size={20} strokeWidth={1.75} aria-hidden="true" />
              </div>
              <p className="mt-2.5 text-sm font-semibold text-[#18181B]">
                {selectedFile ? selectedFile.name : 'Pilih atau tarik file .xlsx / .csv ke sini'}
              </p>
              <p className="mt-1 text-xs text-[#52525B]">
                {selectedFile
                  ? `${Math.max(1, Math.round(selectedFile.size / 1024))} KB`
                  : 'Mendukung file Excel (.xlsx, .xls) dan CSV (.csv)'}
              </p>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy}
                className="mt-3 min-h-[44px] cursor-pointer rounded-[8px] border border-[#D4D4D8] bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-[#18181B] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                {selectedFile ? 'Ganti File' : 'Pilih File Gudang'}
              </button>
            </div>

            {fileError && (
              <div
                role="alert"
                className="rounded-[8px] border border-[#CC0000]/30 bg-[#FEF2F2] px-3.5 py-2.5 text-xs font-medium text-[#991B1B]"
              >
                {fileError}
              </div>
            )}

            {isParsing && (
              <p className="py-2 text-center text-sm font-medium text-[#52525B]">
                Membaca seluruh sheet dan memvalidasi data...
              </p>
            )}

            {isSaving && (
              <p className="py-2 text-center text-sm font-medium text-[#52525B]">
                Memproses dan menyimpan data gudang ke Supabase...
              </p>
            )}

            {activeParsed && (
              <div className="space-y-3 rounded-[8px] border border-[#E4E4E7] bg-white/95 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[#18181B]">
                      {savedSummary
                        ? `Upload Selesai: ${savedSummary.fileName}`
                        : 'Pratinjau Data Sebelum Disimpan'}
                    </p>
                    <p className="text-xs text-[#52525B]">
                      Sheet terbaca:{' '}
                      <span className="font-semibold text-[#18181B]">
                        {activeParsed.sheetsProcessed.length > 0
                          ? activeParsed.sheetsProcessed.join(', ')
                          : '-'}
                      </span>
                    </p>
                  </div>

                  {savedSummary && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenHistory();
                      }}
                      aria-label="Buka Riwayat Upload"
                      title="Buka Riwayat Upload"
                      className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                    >
                      <FileClock size={18} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-[8px] border border-[#F4F4F5] bg-[#FAFAFA] p-2.5 text-xs sm:grid-cols-3">
                  <div>
                    <span className="block text-[#52525B]">Total Baris Data</span>
                    <span className="tabular-nums text-sm font-bold text-[#18181B]">
                      {activeParsed.totalRows}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[#52525B]">
                      {savedSummary ? 'Berhasil Disimpan' : 'Part Unik Siap Simpan'}
                    </span>
                    <span className="tabular-nums text-sm font-bold text-[#166534]">
                      {activeParsed.validRows.length}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[#52525B]">Duplikat Digabung</span>
                    <span className="tabular-nums text-sm font-bold text-[#18181B]">
                      {activeParsed.duplicateMergedCount}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[#52525B]">Kode Substitusi</span>
                    <span className="tabular-nums text-sm font-bold text-[#18181B]">
                      {activeParsed.substitutionResolvedCount}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[#52525B]">Baris Gagal</span>
                    <span className="tabular-nums text-sm font-bold text-[#CC0000]">
                      {activeParsed.failedRows.length}
                    </span>
                  </div>
                </div>

                {hasPartialColumns && (
                  <p className="rounded-[6px] border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 text-xs text-[#3F3F46]">
                    Kolom kode rak diisi &apos;-&apos;, harga akan dilengkapi dari referensi Honda Cengkareng, dan status stok ditandai Belum Diatur sampai data stok gudang diunggah.
                  </p>
                )}

                {storageWarning && (
                  <p className="text-xs font-medium text-[#92400E]">{storageWarning}</p>
                )}

                {activeParsed.failedRows.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#CC0000]">
                        Rincian baris tidak berhasil ({activeParsed.failedRows.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowFailedDetail((prev) => !prev)}
                        aria-expanded={showFailedDetail}
                        aria-label={
                          showFailedDetail
                            ? 'Sembunyikan rincian baris gagal'
                            : 'Tampilkan rincian baris gagal'
                        }
                        title={
                          showFailedDetail
                            ? 'Sembunyikan rincian baris gagal'
                            : 'Tampilkan rincian baris gagal'
                        }
                        className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] text-[#18181B] hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                      >
                        {showFailedDetail ? (
                          <ChevronUp size={18} strokeWidth={1.75} aria-hidden="true" />
                        ) : (
                          <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
                        )}
                      </button>
                    </div>

                    {showFailedDetail && (
                      <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-xs text-[#3F3F46]">
                        {activeParsed.failedRows.map((row, idx) => (
                          <li
                            key={`${row.rowNumber}-${idx}`}
                            className="rounded-[6px] border border-[#F4F4F5] bg-[#FAFAFA] px-2.5 py-1.5"
                          >
                            <span className="tabular-nums font-semibold text-[#CC0000]">
                              {row.sheetName ? `${row.sheetName} Baris ${row.rowNumber}` : `Baris ${row.rowNumber}`}
                            </span>{' '}
                            <span className="tabular-nums text-[#52525B]">
                              ({row.rawPartCode})
                            </span>
                            : {row.reason}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleConfirmSave}
              disabled={!selectedFile || !previewParsed || isBusy || Boolean(savedSummary)}
              className="min-h-[44px] w-full cursor-pointer rounded-[8px] bg-[#CC0000] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              {isSaving
                ? 'Memproses dan menyimpan data gudang...'
                : savedSummary
                  ? 'Data Sudah Disimpan'
                  : 'Konfirmasi & Simpan ke Gudang'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
