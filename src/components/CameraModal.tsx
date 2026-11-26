import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { SwitchCamera, X } from 'lucide-react';
import { applyWatermarkToCanvas } from '../utils/watermark';
import { SurfaceWatermark } from './WatermarkOverlay';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallbackInput: () => void;
}

type FacingMode = 'environment' | 'user';

export function CameraModal({
  isOpen,
  onClose,
  onCapture,
  onFallbackInput,
}: CameraModalProps) {
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isClosingRef = useRef(false);

  // Hentikan seluruh MediaStreamTrack agar kamera tidak tetap menyala di latar belakang.
  const stopActiveStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    stopActiveStream();

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
  }, [onClose, stopActiveStream]);

  useEffect(() => {
    if (!isOpen) return;
    isClosingRef.current = false;

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
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  useEffect(() => {
    if (!isOpen) {
      stopActiveStream();
      return;
    }

    const canUseGetUserMedia =
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof window !== 'undefined' &&
      window.isSecureContext;

    if (!canUseGetUserMedia) {
      stopActiveStream();
      onClose();
      onFallbackInput();
      return;
    }

    let cancelled = false;
    setIsInitializing(true);
    setErrorMessage('');
    stopActiveStream();

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      })
      .then(async (stream) => {
        // Jika modal sudah ditutup sebelum izin diberikan, segera matikan track yang baru aktif.
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          if (!cancelled) {
            setHasMultipleCameras(videoInputs.length > 1);
          }
        } catch {
          // Abaikan jika browser membatasi enumerasi perangkat
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const errName = err instanceof DOMException ? err.name : '';

        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          setErrorMessage(
            'Izin kamera ditolak. Izinkan akses kamera di pengaturan browser atau gunakan ikon klip di kolom pencarian untuk memilih foto.'
          );
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          setErrorMessage(
            'Kamera tidak ditemukan pada perangkat ini. Gunakan ikon klip di kolom pencarian untuk mengunggah foto dari perangkat.'
          );
        } else {
          setErrorMessage(
            'Gagal membuka kamera. Tutup jendela ini lalu coba lagi atau gunakan ikon klip untuk mengunggah foto.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsInitializing(false);
        }
      });

    return () => {
      cancelled = true;
      stopActiveStream();
    };
  }, [isOpen, facingMode, onClose, onFallbackInput, stopActiveStream]);

  const handleTakePhoto = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    await applyWatermarkToCanvas(canvas);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `kamera-part-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        stopActiveStream();
        onCapture(file);
        onClose();
      },
      'image/jpeg',
      0.9
    );
  };

  const handleToggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) {
          handleClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Ambil foto part dengan kamera"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg overflow-hidden rounded-[8px] border border-[#E4E4E7] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
      >
        <SurfaceWatermark variant="light" />
        <div className="relative z-10">
          <div className="flex items-center justify-between border-b border-[#E4E4E7] px-4 py-3">
            <h2 className="text-sm sm:text-base font-bold text-[#18181B]">
              Ambil foto part
            </h2>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Tutup kamera"
              title="Tutup kamera"
              className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <div className="p-4">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[8px] border border-[#E4E4E7] bg-[#18181B]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${
                  errorMessage || isInitializing ? 'opacity-0' : 'opacity-100'
                }`}
              />

              {!errorMessage && !isInitializing && <SurfaceWatermark variant="dark" />}

              {isInitializing && !errorMessage && (
                <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-white">
                  Membuka kamera...
                </div>
              )}

              {errorMessage && (
                <div className="absolute inset-0 flex items-center justify-center bg-white px-5 text-center text-sm text-[#18181B]">
                  <p>{errorMessage}</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                {hasMultipleCameras && !errorMessage && (
                  <button
                    type="button"
                    onClick={handleToggleCamera}
                    aria-label="Ganti kamera depan atau belakang"
                    title="Ganti kamera"
                    className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                  >
                    <SwitchCamera size={19} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleTakePhoto}
                disabled={isInitializing || Boolean(errorMessage)}
                className="min-h-[44px] cursor-pointer rounded-[8px] bg-[#CC0000] px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                Ambil Foto
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
