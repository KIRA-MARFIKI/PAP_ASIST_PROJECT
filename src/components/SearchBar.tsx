import { ChangeEvent, FormEvent, RefObject, useRef } from 'react';
import { Camera, Paperclip, Search, X } from 'lucide-react';
import { SearchHistory } from './SearchHistory';

interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  selectedImagePreview: string | null;
  selectedImageName: string | null;
  onSelectImage: (file: File) => void;
  onClearImage: () => void;
  onOpenCamera: () => void;
  cameraFallbackInputRef: RefObject<HTMLInputElement | null>;
  historyItems: string[];
  isHistoryOpen: boolean;
  onFocusInput: () => void;
  onBlurInput: () => void;
  onSelectHistory: (item: string) => void;
  onClearHistory: () => void;
  isLoading: boolean;
}

export function SearchBar({
  query,
  onQueryChange,
  onSubmit,
  inputRef,
  selectedImagePreview,
  selectedImageName,
  onSelectImage,
  onClearImage,
  onOpenCamera,
  cameraFallbackInputRef,
  historyItems,
  isHistoryOpen,
  onFocusInput,
  onBlurInput,
  onSelectHistory,
  onClearHistory,
  isLoading,
}: SearchBarProps) {
  const fileUploadInputRef = useRef<HTMLInputElement>(null);

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectImage(file);
    }
    // Reset nilai input agar file yang sama dapat dipilih ulang.
    e.target.value = '';
  };

  return (
    <div className="relative w-full">
      <form
        onSubmit={handleFormSubmit}
        className="flex min-h-[52px] w-full items-center gap-1 rounded-full border border-[#D4D4D8] bg-white px-1.5 sm:px-2 transition-colors focus-within:border-[#CC0000]"
      >
        <button
          type="submit"
          aria-label="Cari part"
          title="Cari part"
          disabled={isLoading}
          className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[#52525B] transition-colors hover:text-[#18181B] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
        >
          <Search size={19} strokeWidth={1.75} aria-hidden="true" />
        </button>

        {selectedImagePreview && (
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-[#E4E4E7] bg-[#F4F4F5] py-1 pl-1 pr-0.5">
            <img
              src={selectedImagePreview}
              alt={selectedImageName || 'Foto part'}
              className="h-6 w-6 rounded-full object-cover"
            />
            <button
              type="button"
              onClick={onClearImage}
              aria-label="Hapus foto terpilih"
              title="Hapus foto terpilih"
              className="-my-2 -mr-1.5 flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-full text-[#52525B] transition-colors hover:text-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              <X size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={onFocusInput}
          onBlur={onBlurInput}
          placeholder="Search your part"
          aria-label="Search your part"
          className="min-w-0 flex-1 bg-transparent pr-1 text-sm sm:text-[15px] text-[#18181B] placeholder:text-[#71717A] focus:outline-none"
        />

        <input
          ref={fileUploadInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />

        <input
          ref={cameraFallbackInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />

        <div className="flex shrink-0 items-center">
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Hapus teks pencarian"
              title="Hapus teks pencarian"
              className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[#52525B] transition-colors hover:bg-[#F4F4F5] hover:text-[#18181B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              <X size={17} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={() => fileUploadInputRef.current?.click()}
            aria-label="Unggah foto part dari perangkat"
            title="Unggah foto part dari perangkat"
            className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[#52525B] transition-colors hover:bg-[#F4F4F5] hover:text-[#18181B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
          >
            <Paperclip size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onOpenCamera}
            aria-label="Ambil foto part dengan kamera"
            title="Ambil foto part dengan kamera"
            className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[#52525B] transition-colors hover:bg-[#F4F4F5] hover:text-[#18181B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
          >
            <Camera size={19} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </form>

      <SearchHistory
        items={historyItems}
        isOpen={isHistoryOpen}
        onSelect={onSelectHistory}
        onClear={onClearHistory}
      />
    </div>
  );
}
