import { useEffect, useState } from 'react';
import { CategoryMeta } from '../services/categoryPartsService';
import { CategoryThumbnailInfo } from '../types/part';
import { createPartPlaceholder } from '../utils/partPlaceholder';

interface CategoryCardProps {
  category: CategoryMeta;
  thumbnailInfo?: CategoryThumbnailInfo;
  onSelect: () => void;
}

export function CategoryCard({
  category,
  thumbnailInfo,
  onSelect,
}: CategoryCardProps) {
  const fallbackSrc = createPartPlaceholder(category.fallbackLabel);
  const [imgSrc, setImgSrc] = useState<string>(thumbnailInfo?.photoUrl || fallbackSrc);

  useEffect(() => {
    setImgSrc(thumbnailInfo?.photoUrl || fallbackSrc);
  }, [thumbnailInfo?.photoUrl, fallbackSrc]);

  const count = thumbnailInfo?.count ?? 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="hero-stagger group flex min-h-[44px] w-full cursor-pointer flex-col items-center justify-between rounded-[8px] border border-[#E5E7EB] bg-white p-3.5 text-center transition-colors hover:border-[#CC0000]/60 hover:bg-[#FAFAFA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
    >
      <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-[6px] bg-[#FAFAFA] p-2">
        <img
          src={imgSrc}
          alt={category.label}
          width={120}
          height={96}
          loading="lazy"
          onError={() => {
            if (imgSrc !== fallbackSrc) {
              setImgSrc(fallbackSrc);
            }
          }}
          className="h-full max-h-20 w-auto max-w-full object-contain transition-transform duration-200 group-hover:scale-[1.03]"
        />
      </div>

      <div className="mt-3 flex w-full flex-col items-center">
        <span className="text-xs sm:text-sm font-semibold leading-snug text-[#18181B] group-hover:text-[#CC0000] transition-colors">
          {category.label}
        </span>
        {count > 0 && (
          <span className="tabular-nums mt-1 text-[11px] font-medium text-[#52525B]">
            {count} part katalog
          </span>
        )}
      </div>
    </button>
  );
}
