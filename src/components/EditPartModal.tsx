import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { PartCategory, PartItem, PriceSource, SinglePartUpdatePayload } from '../types/part';
import { SurfaceWatermark } from './WatermarkOverlay';

interface EditPartModalProps {
  part: PartItem | null;
  onClose: () => void;
  onSave: (payload: SinglePartUpdatePayload) => Promise<void>;
}

interface EditErrors {
  namaResmi?: string;
  harga?: string;
  stok?: string;
  stokMinimum?: string;
  form?: string;
}

export function EditPartModal({ part, onClose, onSave }: EditPartModalProps) {
  const isOpen = Boolean(part);
  const lastPartRef = useRef<PartItem | null>(part);
  if (part) {
    lastPartRef.current = part;
  }
  const activePart = part ?? lastPartRef.current;

  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const shouldRender = useAnimatedPresence(isOpen, backdropRef, dialogRef);

  const [namaResmi, setNamaResmi] = useState('');
  const [kodeRak, setKodeRak] = useState('-');
  const [hargaText, setHargaText] = useState('');
  const [kategori, setKategori] = useState<PartCategory>('fast');
  const [stockUnknown, setStockUnknown] = useState(false);
  const [stokText, setStokText] = useState('');
  const [stokMinText, setStokMinText] = useState('');
  const [aliasesText, setAliasesText] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<EditErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!part) return;
    setNamaResmi(part.namaResmi);
    setKodeRak(part.kodeRak || '-');
    setHargaText(part.harga !== null ? String(part.harga) : '');
    setKategori(part.kategori);
    setStockUnknown(!part.stockKnown);
    setStokText(part.stockKnown && part.stok !== null ? String(part.stok) : '');
    setStokMinText(part.stockKnown && part.stokMinimum !== null ? String(part.stokMinimum) : '');
    setAliasesText(part.aliases.join(', '));
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setErrors({});
    setIsSaving(false);
  }, [part]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isSaving, onClose]);

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activePart || isSaving) return;

    const nextErrors: EditErrors = {};
    const cleanName = namaResmi.trim().toUpperCase();
    const cleanRack = kodeRak.trim().toUpperCase() || '-';
    const trimmedPrice = hargaText.trim();

    if (!cleanName) {
      nextErrors.namaResmi = 'Nama resmi part wajib diisi.';
    }

    let parsedHarga: number | null = null;
    if (trimmedPrice !== '') {
      if (!/^\d+$/.test(trimmedPrice)) {
        nextErrors.harga = 'Harga harus berupa angka bulat non-negatif.';
      } else {
        parsedHarga = Number(trimmedPrice);
      }
    }

    let parsedStok: number | null = null;
    let parsedStokMin: number | null = null;
    const stockKnown = !stockUnknown;

    if (stockKnown) {
      if (!/^\d+$/.test(stokText.trim())) {
        nextErrors.stok = 'Stok saat ini wajib diisi angka bulat non-negatif.';
      } else {
        parsedStok = Number(stokText.trim());
      }

      if (!/^\d+$/.test(stokMinText.trim())) {
        nextErrors.stokMinimum = 'Stok minimum wajib diisi angka bulat non-negatif.';
      } else {
        parsedStokMin = Number(stokMinText.trim());
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const parsedAliases = Array.from(
      new Set(
        aliasesText
          .split(',')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean)
      )
    );

    const nextPriceSource: PriceSource =
      parsedHarga !== null && parsedHarga > 0
        ? 'warehouse'
        : parsedHarga === null
          ? 'none'
          : activePart.priceSource;

    setErrors({});
    setIsSaving(true);

    try {
      await onSave({
        partCodeKey: activePart.id,
        namaResmi: cleanName,
        kodeRak: cleanRack,
        harga: parsedHarga,
        priceSource: nextPriceSource,
        kategori,
        stok: parsedStok,
        stokMinimum: parsedStokMin,
        stockKnown,
        aliases: parsedAliases,
        photoFile,
      });
      onClose();
    } catch (err) {
      setErrors({
        form:
          err instanceof Error
            ? err.message
            : 'Gagal menyimpan perubahan part. Periksa koneksi lalu coba lagi.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!shouldRender || !activePart) return null;

  return (
    <div
      ref={backdropRef}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current && !isSaving) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-part-modal-title"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-[8px] border border-[#E4E4E7] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
      >
        <SurfaceWatermark variant="light" />

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-3 border-b border-[#E4E4E7] px-5 py-3.5">
            <div className="min-w-0">
              <h2 id="edit-part-modal-title" className="text-base font-bold text-[#18181B]">
                Edit Cepat Part
              </h2>
              <p className="tabular-nums mt-0.5 truncate text-xs font-medium text-[#52525B]">
                {activePart.kodePart} · {activePart.namaResmi}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              aria-label="Tutup edit part"
              title="Tutup"
              className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4 p-5">
            {errors.form && (
              <div
                role="alert"
                className="rounded-[8px] border border-[#CC0000]/30 bg-[#FEF2F2] px-3.5 py-2.5 text-xs font-medium text-[#991B1B]"
              >
                {errors.form}
              </div>
            )}

            <div>
              <label
                htmlFor="edit-part-name"
                className="mb-1 block text-xs font-semibold text-[#18181B]"
              >
                Nama Resmi Part
              </label>
              <input
                id="edit-part-name"
                type="text"
                value={namaResmi}
                onChange={(e) => {
                  setNamaResmi(e.target.value);
                  if (errors.namaResmi) setErrors((prev) => ({ ...prev, namaResmi: undefined }));
                }}
                className="min-h-[44px] w-full rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
              />
              {errors.namaResmi && (
                <p className="mt-1 text-xs font-medium text-[#CC0000]">{errors.namaResmi}</p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="edit-part-rack"
                  className="mb-1 block text-xs font-semibold text-[#18181B]"
                >
                  Kode Rak
                </label>
                <input
                  id="edit-part-rack"
                  type="text"
                  value={kodeRak}
                  onChange={(e) => setKodeRak(e.target.value)}
                  placeholder="Contoh: A-12"
                  className="tabular-nums min-h-[44px] w-full rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-part-price"
                  className="mb-1 block text-xs font-semibold text-[#18181B]"
                >
                  Harga Padang Panjang (Rp)
                </label>
                <input
                  id="edit-part-price"
                  type="text"
                  inputMode="numeric"
                  value={hargaText}
                  onChange={(e) => {
                    setHargaText(e.target.value.replace(/\D/g, ''));
                    if (errors.harga) setErrors((prev) => ({ ...prev, harga: undefined }));
                  }}
                  placeholder="Kosongkan jika belum ada"
                  className="tabular-nums min-h-[44px] w-full rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                />
                {errors.harga && (
                  <p className="mt-1 text-xs font-medium text-[#CC0000]">{errors.harga}</p>
                )}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-[#18181B]">
                Kategori
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setKategori('fast')}
                  className={`min-h-[44px] cursor-pointer rounded-[8px] border px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000] ${
                    kategori === 'fast'
                      ? 'border-[#CC0000] bg-[#CC0000] text-white'
                      : 'border-[#D4D4D8] bg-white text-[#18181B] hover:bg-[#F4F4F5]'
                  }`}
                >
                  Fast Moving
                </button>
                <button
                  type="button"
                  onClick={() => setKategori('slow')}
                  className={`min-h-[44px] cursor-pointer rounded-[8px] border px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000] ${
                    kategori === 'slow'
                      ? 'border-[#CC0000] bg-[#CC0000] text-white'
                      : 'border-[#D4D4D8] bg-white text-[#18181B] hover:bg-[#F4F4F5]'
                  }`}
                >
                  Slow Moving
                </button>
              </div>
            </div>

            <div className="space-y-2.5 rounded-[8px] border border-[#E4E4E7] bg-[#FAFAFA] p-3.5">
              <label className="flex cursor-pointer items-center gap-2.5 text-xs font-semibold text-[#18181B]">
                <input
                  type="checkbox"
                  checked={stockUnknown}
                  onChange={(e) => {
                    setStockUnknown(e.target.checked);
                    setErrors((prev) => ({ ...prev, stok: undefined, stokMinimum: undefined }));
                  }}
                  className="h-4 w-4 accent-[#CC0000]"
                />
                <span>Stok belum diatur</span>
              </label>

              {!stockUnknown && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label
                      htmlFor="edit-part-stock"
                      className="mb-1 block text-xs font-semibold text-[#18181B]"
                    >
                      Stok Saat Ini
                    </label>
                    <input
                      id="edit-part-stock"
                      type="text"
                      inputMode="numeric"
                      value={stokText}
                      onChange={(e) => {
                        setStokText(e.target.value.replace(/\D/g, ''));
                        if (errors.stok) setErrors((prev) => ({ ...prev, stok: undefined }));
                      }}
                      placeholder="0"
                      className="tabular-nums min-h-[44px] w-full rounded-[8px] border border-[#D4D4D8] bg-white px-3 py-2 text-sm text-[#18181B] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                    />
                    {errors.stok && (
                      <p className="mt-1 text-xs font-medium text-[#CC0000]">{errors.stok}</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="edit-part-min-stock"
                      className="mb-1 block text-xs font-semibold text-[#18181B]"
                    >
                      Stok Minimum
                    </label>
                    <input
                      id="edit-part-min-stock"
                      type="text"
                      inputMode="numeric"
                      value={stokMinText}
                      onChange={(e) => {
                        setStokMinText(e.target.value.replace(/\D/g, ''));
                        if (errors.stokMinimum) {
                          setErrors((prev) => ({ ...prev, stokMinimum: undefined }));
                        }
                      }}
                      placeholder="0"
                      className="tabular-nums min-h-[44px] w-full rounded-[8px] border border-[#D4D4D8] bg-white px-3 py-2 text-sm text-[#18181B] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                    />
                    {errors.stokMinimum && (
                      <p className="mt-1 text-xs font-medium text-[#CC0000]">
                        {errors.stokMinimum}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-part-aliases"
                className="mb-1 block text-xs font-semibold text-[#18181B]"
              >
                Alias Pencarian (pisahkan dengan koma)
              </label>
              <input
                id="edit-part-aliases"
                type="text"
                value={aliasesText}
                onChange={(e) => setAliasesText(e.target.value)}
                placeholder="batang padi, as shock depan, fork pipe"
                className="min-h-[44px] w-full rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-[#18181B]">
                Foto Part (Opsional)
              </span>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
                aria-hidden="true"
              />
              <div className="flex items-center gap-3">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[8px] border border-[#E4E4E7] bg-[#F4F4F5]">
                  <img
                    src={photoPreviewUrl || activePart.foto}
                    alt={activePart.namaResmi}
                    className="h-full w-full object-cover"
                  />
                  <SurfaceWatermark variant="compact" />
                </div>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isSaving}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[8px] border border-[#D4D4D8] bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-[#18181B] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                >
                  <Upload size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span>{photoFile ? photoFile.name : 'Pilih Foto Baru'}</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="min-h-[44px] w-full cursor-pointer rounded-[8px] bg-[#CC0000] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              {isSaving ? 'Menyimpan perubahan part...' : 'Simpan Perubahan'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
