interface SurfaceWatermarkProps {
  variant?: 'light' | 'dark' | 'compact';
}

const GLOBAL_TILES = Array.from({ length: 18 }, (_, idx) => idx);
const SURFACE_TILES = Array.from({ length: 9 }, (_, idx) => idx);

export function WatermarkOverlay() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 select-none overflow-hidden"
    >
      <div className="grid h-[140%] w-[140%] -translate-x-[20%] -translate-y-[20%] -rotate-[22deg] grid-cols-3 sm:grid-cols-6 place-items-center gap-12 sm:gap-16">
        {GLOBAL_TILES.map((index) => (
          <img
            key={index}
            src="/PAP10.webp"
            alt=""
            width={1696}
            height={2528}
            className="h-24 w-auto object-contain opacity-[0.065] mix-blend-multiply"
          />
        ))}
      </div>
    </div>
  );
}

export function SurfaceWatermark({ variant = 'light' }: SurfaceWatermarkProps) {
  if (variant === 'compact') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden select-none"
      >
        <img
          src="/PAP10.webp"
          alt=""
          width={1696}
          height={2528}
          className="h-12 w-auto -rotate-[18deg] object-contain opacity-[0.09] mix-blend-multiply"
        />
      </div>
    );
  }

  if (variant === 'dark') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 flex items-end justify-end overflow-hidden p-3 select-none"
      >
        <img
          src="/PAP10.webp"
          alt=""
          width={1696}
          height={2528}
          className="h-10 w-auto rounded-[4px] bg-white/85 p-1 object-contain opacity-65"
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
    >
      <div className="grid h-[140%] w-[140%] -translate-x-[20%] -translate-y-[20%] -rotate-[22deg] grid-cols-3 place-items-center gap-10">
        {SURFACE_TILES.map((index) => (
          <img
            key={index}
            src="/PAP10.webp"
            alt=""
            width={1696}
            height={2528}
            className="h-20 w-auto object-contain opacity-[0.065] mix-blend-multiply"
          />
        ))}
      </div>
    </div>
  );
}
