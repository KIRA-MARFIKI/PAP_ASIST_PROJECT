import { useState } from 'react';
import hondaPartBanner from '../assets/banner_honda_part.webp';

export function PromoBanner() {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="hero-stagger mt-6 aspect-[1366/450] w-full overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-[#F7F7F8]">
      {hasError ? (
        <div
          role="status"
          className="flex h-full w-full items-center justify-center px-4 text-center text-xs sm:text-sm font-medium text-[#52525B]"
        >
          Banner promo sedang tidak tersedia
        </div>
      ) : (
        <img
          src={hondaPartBanner}
          alt="Suku Cadang Asli Honda"
          width={1366}
          height={450}
          fetchPriority="high"
          onError={() => setHasError(true)}
          className="block h-full w-full select-none object-cover"
        />
      )}
    </div>
  );
}
