import { WatermarkOverlay } from './WatermarkOverlay';

interface ErrorFallbackPageProps {
  mode: '404' | 'runtime';
  onGoHome: () => void;
}

export function ErrorFallbackPage({ mode, onGoHome }: ErrorFallbackPageProps) {
  const isNotFound = mode === '404';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-white px-4 py-12 text-[#18181B]">
      <WatermarkOverlay />

      <main className="relative z-20 flex w-full max-w-md flex-col items-center text-center">
        <img
          src="/honda-7.webp"
          alt="Logo Honda"
          width={160}
          height={54}
          fetchPriority="high"
          className="mb-2 h-9 w-auto select-none object-contain"
        />
        <div className="flex h-14 w-[200px] items-center justify-center overflow-hidden">
          <img
            src="/PAP1.webp"
            alt="PaP Asist"
            width={2000}
            height={2000}
            fetchPriority="high"
            className="h-[240px] w-[240px] max-w-none select-none object-contain mix-blend-multiply"
          />
        </div>

        <span className="tabular-nums mt-4 inline-flex items-center rounded-[8px] border border-[#CC0000]/30 bg-[#FEF2F2] px-3 py-1 text-xs font-bold text-[#CC0000]">
          {isNotFound ? 'Error 404' : 'Error Sistem'}
        </span>

        <h1 className="mt-4 text-xl sm:text-2xl font-bold text-[#18181B]">
          Maaf, sedang terjadi error
        </h1>

        <p className="mt-2 text-sm leading-relaxed text-[#52525B]">
          {isNotFound
            ? 'Halaman yang Anda buka tidak ditemukan di PaP Asist.'
            : 'Terjadi gangguan teknis saat memuat tampilan.'}
        </p>

        <div className="mt-6 flex w-full flex-col gap-2.5 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onGoHome}
            className="min-h-[44px] cursor-pointer rounded-[8px] bg-[#CC0000] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
          >
            Kembali ke Beranda
          </button>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[44px] cursor-pointer rounded-[8px] border border-[#D4D4D8] bg-white px-5 py-2.5 text-sm font-semibold text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
          >
            Muat Ulang Halaman
          </button>
        </div>
      </main>
    </div>
  );
}
