import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAnimatedPresence } from '../hooks/useAnimatedPresence';
import { SurfaceWatermark } from './WatermarkOverlay';

export type AiNoticeState =
  | {
      type: 'ai_error';
      message: string;
      retryAfterSeconds: number;
    }
  | {
      type: 'non_honda_part';
      title?: string;
      message?: string;
    };

interface AiNoticeModalProps {
  notice: AiNoticeState | null;
  onClose: () => void;
  onRetrySearch: () => void;
  onOpenPartsTable: () => void;
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function AiNoticeModal({
  notice,
  onClose,
  onRetrySearch,
  onOpenPartsTable,
}: AiNoticeModalProps) {
  const isOpen = Boolean(notice);
  const lastNoticeRef = useRef<AiNoticeState | null>(notice);
  if (notice) {
    lastNoticeRef.current = notice;
  }
  const activeNotice = notice ?? lastNoticeRef.current;

  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const shouldRender = useAnimatedPresence(isOpen, backdropRef, dialogRef);

  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!notice || notice.type !== 'ai_error') {
      setSecondsLeft(0);
      return;
    }

    const initial = Math.max(0, Math.floor(notice.retryAfterSeconds));
    setSecondsLeft(initial);
    if (initial <= 0) return;

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [notice]);

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

  if (!shouldRender || !activeNotice) return null;

  const isAiError = activeNotice.type === 'ai_error';
  const canRetry = secondsLeft <= 0;

  return (
    <div
      ref={backdropRef}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-notice-title"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md overflow-hidden rounded-[8px] border border-[#E4E4E7] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
      >
        <SurfaceWatermark variant="light" />

        <div className="relative z-10 p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex h-10 w-[140px] items-center justify-start overflow-hidden">
              <img
                src="/PAP1.webp"
                alt="PaP Asist"
                width={2000}
                height={2000}
                className="h-[160px] w-[160px] max-w-none select-none object-contain mix-blend-multiply"
              />
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup pemberitahuan"
              title="Tutup"
              className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          {isAiError ? (
            <div className="mt-3">
              <h2 id="ai-notice-title" className="text-lg font-bold text-[#18181B]">
                Maaf, AI sedang mengalami error
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[#52525B]">
                {activeNotice.message}
              </p>

              <div className="mt-4 rounded-[8px] border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3 text-center">
                <p className="text-xs font-medium text-[#52525B]">
                  {canRetry
                    ? 'Anda sudah dapat mencoba pencarian ulang sekarang'
                    : 'Silakan coba lagi dalam'}
                </p>
                <p className="tabular-nums mt-1 text-2xl font-bold text-[#CC0000]">
                  {formatCountdown(secondsLeft)}
                </p>
                {!canRetry && (
                  <p className="mt-0.5 text-[11px] text-[#52525B]">menit:detik</p>
                )}
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onRetrySearch();
                  }}
                  disabled={!canRetry}
                  className="min-h-[44px] w-full cursor-pointer rounded-[8px] bg-[#CC0000] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                >
                  {canRetry
                    ? 'Coba Lagi'
                    : `Coba Lagi (${formatCountdown(secondsLeft)})`}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPartsTable();
                  }}
                  className="min-h-[44px] w-full cursor-pointer rounded-[8px] border border-[#D4D4D8] bg-white px-4 py-2.5 text-sm font-semibold text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                >
                  Buka Daftar Part Gudang
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <h2 id="ai-notice-title" className="text-lg font-bold text-[#18181B]">
                {activeNotice.title || 'Bukan Sparepart Motor Honda'}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#52525B]">
                {activeNotice.message ||
                  'PaP Asist hanya melayani pencarian suku cadang motor Honda berdasarkan data gudang Menara Agung Padang Panjang dan katalog Honda Cengkareng.'}
              </p>

              <button
                type="button"
                onClick={onClose}
                className="mt-5 min-h-[44px] w-full cursor-pointer rounded-[8px] bg-[#CC0000] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                Mengerti
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
