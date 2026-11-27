import { useEffect, useState } from 'react';
import { createPartPlaceholder } from '../utils/partPlaceholder';
import { SearchResultItem, WarehouseStockStatus } from '../types/part';
import { formatRupiah } from '../services/partsRepository';
import { SurfaceWatermark } from './WatermarkOverlay';

interface ResultCardProps {
  part: SearchResultItem;
}

function getWarehouseStatusBadge(
  status: WarehouseStockStatus,
  inWarehouse: boolean,
  customLabel?: string | null
): {
  label: string;
  className: string;
} {
  if (!inWarehouse || status === 'belum_di_gudang') {
    return {
      label: customLabel || 'Belum ada di Honda Menara Agung Padang Panjang',
      className: 'border-[#92400E]/35 bg-[#FFFBEB] text-[#92400E]',
    };
  }
  if (status === 'tersedia') {
    return {
      label: 'Tersedia',
      className: 'border-[#166534]/30 bg-[#F0FDF4] text-[#166534]',
    };
  }
  if (status === 'kritis') {
    return {
      label: 'Kritis',
      className: 'border-[#92400E]/35 bg-[#FFFBEB] text-[#92400E]',
    };
  }
  if (status === 'belum_diatur') {
    return {
      label: 'Belum Diatur',
      className: 'border-[#52525B]/30 bg-[#F4F4F5] text-[#3F3F46]',
    };
  }
  return {
    label: 'Tidak Tersedia',
    className: 'border-[#CC0000]/35 bg-[#FEF2F2] text-[#CC0000]',
  };
}

function getSafeExternalUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export function ResultCard({ part }: ResultCardProps) {
  const [imgSrc, setImgSrc] = useState(part.foto);
  const safeSourceUrl = getSafeExternalUrl(part.sourceUrl);

  useEffect(() => {
    setImgSrc(part.foto);
  }, [part.foto]);

  const badge = getWarehouseStatusBadge(
    part.stockStatus,
    part.inWarehouse,
    part.statusLabel
  );

  return (
    <article className="result-card flex items-center gap-4 rounded-[8px] border border-[#E4E4E7] bg-white p-3.5 sm:p-4">
      <div className="relative h-20 w-20 sm:h-24 sm:w-24 shrink-0 overflow-hidden rounded-[8px] border border-[#E4E4E7] bg-[#F4F4F5]">
        <img
          src={imgSrc}
          alt={part.namaResmi}
          onError={() => {
            const fallback = createPartPlaceholder(part.namaResmi);
            if (imgSrc !== fallback) {
              setImgSrc(fallback);
            }
          }}
          className="h-full w-full object-cover"
        />
        <SurfaceWatermark variant="compact" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-sm sm:text-base font-bold leading-snug text-[#18181B]">
            {part.namaResmi}
          </h2>
          <span
            className={`inline-flex shrink-0 items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:text-sm">
          <div>
            <span className="block text-[11px] text-[#52525B]">Kode part</span>
            <span className="tabular-nums font-medium text-[#27272A]">
              {part.kodePart}
            </span>
          </div>
          <div>
            <span className="block text-[11px] text-[#52525B]">Kode rak</span>
            <span className="tabular-nums font-medium text-[#27272A]">
              {part.kodeRak || '-'}
            </span>
          </div>
        </div>

        <div className="mt-2.5">
          {part.harga !== null ? (
            <div className="space-y-1.5">
              <div className="text-sm sm:text-base font-bold text-[#18181B] tabular-nums">
                {formatRupiah(part.harga)}
              </div>
              {part.priceSource === 'cengkareng' && (
                <div className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#E5E7EB] bg-[#F7F7F8] px-2 py-1 text-[11px] font-medium text-[#3F3F46]">
                  <img
                    src="/PAP10.webp"
                    alt=""
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 object-contain opacity-75"
                  />
                  <span>Harga dari katalog hondacengkareng.com</span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[#52525B]">
                Harga belum tersedia
              </span>
              {safeSourceUrl && (
                <a
                  href={safeSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[32px] cursor-pointer items-center rounded-[6px] border border-[#E4E4E7] bg-[#F7F7F8] px-2.5 py-1 text-xs font-semibold text-[#18181B] underline decoration-[#CC0000]/60 underline-offset-2 transition-colors hover:border-[#CC0000]/50 hover:text-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                >
                  Cek katalog hondacengkareng.com
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
