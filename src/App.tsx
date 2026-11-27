import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { Lock, LogOut, ShieldCheck, Table } from 'lucide-react';
import { SearchBar } from './components/SearchBar';
import { ResultCard } from './components/ResultCard';
import { PartsTablePanel } from './components/PartsTablePanel';
import { NotificationMenu } from './components/NotificationMenu';
import { CameraModal } from './components/CameraModal';
import { AdminSession, LoginModal } from './components/LoginModal';
import { WatermarkOverlay } from './components/WatermarkOverlay';
import { SearchLoadingState } from './components/SearchLoadingState';
import { ErrorFallbackPage } from './components/ErrorFallbackPage';
import { AiNoticeModal, AiNoticeState } from './components/AiNoticeModal';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { applyWatermarkToImageFile } from './utils/watermark';
import {
  fetchAllParts,
  getLowStockParts,
  getUploadHistory,
  partItemToSearchResult,
  recordUploadHistory,
  triggerEnrichPartsBatch,
  updateSinglePart,
  upsertWarehouseParts,
} from './services/partsRepository';
import {
  AiSearchError,
  searchPartWithImage,
  searchPartWithText,
} from './services/geminiPartAgent';
import {
  PartItem,
  SearchResultItem,
  SearchStatus,
  SinglePartUpdatePayload,
  UploadHistoryRecord,
  WarehouseParseResult,
} from './types/part';

const AdminAsistPanel = lazy(() =>
  import('./components/AdminAsistPanel').then((m) => ({ default: m.AdminAsistPanel }))
);
const UploadDataModal = lazy(() =>
  import('./components/UploadDataModal').then((m) => ({ default: m.UploadDataModal }))
);
const UploadHistoryPanel = lazy(() =>
  import('./components/UploadHistoryPanel').then((m) => ({ default: m.UploadHistoryPanel }))
);
const AdminCredentialsModal = lazy(() =>
  import('./components/AdminCredentialsModal').then((m) => ({ default: m.AdminCredentialsModal }))
);

gsap.registerPlugin(Flip);

const HISTORY_STORAGE_KEY = 'pap-asist-search-history';
const PIN_SESSION_KEY = 'pap-asist-pin-verified-uid';
const MAX_HISTORY_ITEMS = 8;

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_HISTORY_ITEMS)
      : [];
  } catch {
    return [];
  }
}

function isKnownRootPath(pathname: string): boolean {
  return pathname === '/' || pathname === '' || pathname === '/index.html';
}

export function App() {
  const [isNotFoundRoute, setIsNotFoundRoute] = useState(
    () => !isKnownRootPath(window.location.pathname)
  );

  const [parts, setParts] = useState<PartItem[]>([]);
  const [partsLoadError, setPartsLoadError] = useState<string>('');
  const lowStock = useMemo(() => getLowStockParts(parts), [parts]);

  const [uploadHistory, setUploadHistory] = useState<UploadHistoryRecord[]>([]);
  const [uploadHistoryError, setUploadHistoryError] = useState<string | undefined>(undefined);

  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [loadingMode, setLoadingMode] = useState<'text' | 'image'>('text');
  const [officialQueryName, setOfficialQueryName] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [searchNote, setSearchNote] = useState('');
  const [aiNotice, setAiNotice] = useState<AiNoticeState | null>(null);

  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);

  const [historyItems, setHistoryItems] = useState<string[]>(() => loadHistory());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [isTableOpen, setIsTableOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isUploadHistoryOpen, setIsUploadHistoryOpen] = useState(false);
  const [isCredentialsOpen, setIsCredentialsOpen] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const searchDockRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const cameraFallbackInputRef = useRef<HTMLInputElement>(null);
  const flipStateRef = useRef<Flip.FlipState | null>(null);
  const isPinFlowBusyRef = useRef(false);
  const searchRequestIdRef = useRef(0);
  const imageSelectIdRef = useRef(0);
  const lastSearchPayloadRef = useRef<{ query: string; image: File | null }>({
    query: '',
    image: null,
  });

  useEffect(() => {
    const handlePopState = () => {
      setIsNotFoundRoute(!isKnownRootPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    void fetchAllParts().then((res) => {
      if (!active) return;
      setParts(res.parts);
      setPartsLoadError(res.error || '');
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;

    let active = true;

    const hydrateAdminProfile = async (userId: string, fallbackEmail: string) => {
      const { data: profile } = await client
        .from('admin_profiles')
        .select('full_name, email, role, is_active')
        .eq('user_id', userId)
        .maybeSingle();

      if (!active) return;
      if (profile && profile.is_active) {
        setAdminSession({
          userId,
          nama: profile.full_name,
          email: profile.email || fallbackEmail,
          role: profile.role,
        });
      }
    };

    void client.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user || !active || isPinFlowBusyRef.current) return;
      try {
        if (sessionStorage.getItem(PIN_SESSION_KEY) === user.id) {
          void hydrateAdminProfile(user.id, user.email || '');
        }
      } catch {
        // Abaikan bila sessionStorage diblokir browser.
      }
    });

    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT' || !session?.user) {
        try {
          sessionStorage.removeItem(PIN_SESSION_KEY);
        } catch {
          // Abaikan bila sessionStorage tidak tersedia.
        }
        setAdminSession(null);
        setIsAdminOpen(false);
        setIsUploadOpen(false);
        setIsUploadHistoryOpen(false);
        setIsCredentialsOpen(false);
        return;
      }

      // Saat login baru berlangsung, tunggu verifikasi PIN 12 digit selesai di LoginModal sebelum mengaktifkan sesi.
      if (!isPinFlowBusyRef.current && event === 'TOKEN_REFRESHED') {
        try {
          if (sessionStorage.getItem(PIN_SESSION_KEY) === session.user.id) {
            void hydrateAdminProfile(session.user.id, session.user.email || '');
          }
        } catch {
          // Abaikan bila sessionStorage diblokir browser.
        }
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!adminSession) {
      setUploadHistory([]);
      setUploadHistoryError(undefined);
      return;
    }

    let active = true;
    void getUploadHistory().then((res) => {
      if (!active) return;
      setUploadHistory(res.records);
      setUploadHistoryError(res.error);
    });
    return () => {
      active = false;
    };
  }, [adminSession]);

  useEffect(() => {
    if (isNotFoundRoute) return;
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.hero-stagger', {
          opacity: 0,
          y: 16,
          duration: 0.45,
          stagger: 0.08,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
      });
      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('.hero-stagger', { opacity: 1, y: 0 });
      });
    }, pageRef);

    return () => ctx.revert();
  }, [isNotFoundRoute]);

  useLayoutEffect(() => {
    const state = flipStateRef.current;
    const dockEl = searchDockRef.current;
    if (!state || !dockEl) return;

    flipStateRef.current = null;

    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      Flip.from(state, {
        targets: dockEl,
        duration: 0.42,
        ease: 'power3.out',
        simple: true,
      });
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(dockEl, { clearProps: 'all' });
    });

    return () => mm.revert();
  }, [hasSearched]);

  useEffect(() => {
    if (status !== 'success' || results.length === 0) return;

    const container = resultsContainerRef.current;
    if (!container) return;

    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.result-card', {
          opacity: 0,
          y: 14,
          duration: 0.3,
          stagger: 0.07,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
      });
      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('.result-card', { opacity: 1, y: 0 });
      });
    }, container);

    return () => ctx.revert();
  }, [status, results]);

  // Bebaskan object URL preview setiap kali gambar diganti atau komponen unmount untuk mencegah memory leak.
  useEffect(() => {
    return () => {
      if (selectedImagePreview) {
        URL.revokeObjectURL(selectedImagePreview);
      }
    };
  }, [selectedImagePreview]);

  const saveToHistory = useCallback((term: string) => {
    const cleaned = term.trim();
    if (!cleaned) return;
    setHistoryItems((prev) => {
      const filtered = prev.filter((item) => item.toLowerCase() !== cleaned.toLowerCase());
      const next = [cleaned, ...filtered].slice(0, MAX_HISTORY_ITEMS);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Abaikan jika penyimpanan lokal penuh atau diblokir browser.
      }
      return next;
    });
  }, []);

  const handleClearHistory = useCallback(() => {
    setHistoryItems([]);
    setIsHistoryOpen(false);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // Abaikan jika penyimpanan lokal tidak tersedia.
    }
  }, []);

  const triggerDockTransition = useCallback(() => {
    if (!hasSearched && searchDockRef.current) {
      flipStateRef.current = Flip.getState(searchDockRef.current);
      setHasSearched(true);
    }
  }, [hasSearched]);

  const executeSearch = useCallback(
    async (overrideQuery?: string, imageOverride?: File | null) => {
      const activeImage = imageOverride !== undefined ? imageOverride : selectedImageFile;
      const activeQuery = (overrideQuery !== undefined ? overrideQuery : query).trim();

      if (!activeQuery && !activeImage) {
        return;
      }

      const requestId = searchRequestIdRef.current + 1;
      searchRequestIdRef.current = requestId;

      lastSearchPayloadRef.current = { query: activeQuery, image: activeImage };
      setIsHistoryOpen(false);
      setIsNotifOpen(false);
      setAiNotice(null);
      triggerDockTransition();

      setLoadingMode(activeImage ? 'image' : 'text');
      setStatus('loading');
      setSearchNote('');
      setResults([]);

      try {
        const searchResponse = activeImage
          ? await searchPartWithImage(activeImage, activeQuery)
          : await searchPartWithText(activeQuery, parts);

        if (requestId !== searchRequestIdRef.current) {
          return;
        }

        if (searchResponse.isHondaPart === false) {
          setStatus('idle');
          setOfficialQueryName('');
          setResults([]);
          setAiNotice({
            type: 'non_honda_part',
            title: searchResponse.rejectionTitle || 'Bukan Sparepart Motor Honda',
            message: searchResponse.rejectionMessage,
          });
          return;
        }

        if (activeQuery) {
          saveToHistory(activeQuery);
        }

        setOfficialQueryName(searchResponse.translatedQuery || activeQuery.toUpperCase());
        setSearchNote(searchResponse.visualNotes || '');

        if (searchResponse.results.length === 0) {
          setResults([]);
          setStatus('empty');
        } else {
          setResults(searchResponse.results);
          setStatus('success');
        }
      } catch (err) {
        if (requestId !== searchRequestIdRef.current) {
          return;
        }
        setStatus('error');
        if (err instanceof AiSearchError) {
          setAiNotice({
            type: 'ai_error',
            message: err.message,
            retryAfterSeconds: err.retryAfterSeconds,
          });
        } else {
          const detail =
            err instanceof Error
              ? err.message
              : 'Koneksi ke layanan pencarian AI terganggu.';
          setAiNotice({
            type: 'ai_error',
            message: detail,
            retryAfterSeconds: 30,
          });
        }
      }
    },
    [query, selectedImageFile, saveToHistory, triggerDockTransition, parts]
  );

  const handleClearImage = useCallback(() => {
    imageSelectIdRef.current += 1;
    setSelectedImageFile(null);
    setSelectedImagePreview(null);
  }, []);

  const handleSelectImage = useCallback(
    async (file: File, alreadyWatermarked = false) => {
      const selectId = imageSelectIdRef.current + 1;
      imageSelectIdRef.current = selectId;

      try {
        const processedFile = alreadyWatermarked
          ? file
          : await applyWatermarkToImageFile(file);

        if (selectId !== imageSelectIdRef.current) {
          return;
        }

        const previewUrl = URL.createObjectURL(processedFile);
        setSelectedImageFile(processedFile);
        setSelectedImagePreview(previewUrl);
        void executeSearch(query, processedFile);
      } catch (err) {
        if (selectId !== imageSelectIdRef.current) {
          return;
        }
        setAiNotice({
          type: 'ai_error',
          message:
            err instanceof Error
              ? err.message
              : 'Gagal memproses file gambar. Pastikan file berupa foto JPG, PNG, atau WebP yang valid.',
          retryAfterSeconds: 0,
        });
      }
    },
    [executeSearch, query]
  );

  const handleSelectHistory = (item: string) => {
    handleClearImage();
    setQuery(item);
    setIsHistoryOpen(false);
    void executeSearch(item, null);
  };

  const handleSelectNotifPart = (part: PartItem) => {
    searchRequestIdRef.current += 1;
    setIsNotifOpen(false);
    setIsHistoryOpen(false);
    setAiNotice(null);
    handleClearImage();
    setQuery(part.namaResmi);
    triggerDockTransition();
    setOfficialQueryName(part.namaResmi);
    setSearchNote('');
    setResults([partItemToSearchResult(part)]);
    setStatus('success');
  };

  const handleResetHome = () => {
    if (!hasSearched) return;
    searchRequestIdRef.current += 1;
    setHasSearched(false);
    setStatus('idle');
    setResults([]);
    setOfficialQueryName('');
    setSearchNote('');
    setAiNotice(null);
    setQuery('');
    handleClearImage();
  };

  const handleLoginSuccess = (session: AdminSession) => {
    if (session.userId) {
      try {
        sessionStorage.setItem(PIN_SESSION_KEY, session.userId);
      } catch {
        // Abaikan bila sessionStorage diblokir browser.
      }
    }
    setAdminSession(session);
    setIsLoginOpen(false);
    setIsTableOpen(false);
    setIsNotifOpen(false);
    setIsAdminOpen(true);
  };

  const handleLogout = async () => {
    try {
      sessionStorage.removeItem(PIN_SESSION_KEY);
    } catch {
      // Abaikan bila sessionStorage tidak tersedia.
    }
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    setAdminSession(null);
    setIsAdminOpen(false);
    setIsUploadOpen(false);
    setIsUploadHistoryOpen(false);
    setIsCredentialsOpen(false);
  };

  const handleProcessUpload = useCallback(
    async (
      fileName: string,
      parsed: WarehouseParseResult
    ): Promise<{ saved: boolean; storageError?: string }> => {
      let storageError: string | undefined;
      let upsertFailed = false;

      if (parsed.validRows.length > 0) {
        const upsertResult = await upsertWarehouseParts(parsed.validRows, parts);
        setParts(upsertResult.parts);
        if (upsertResult.upsertFailed) {
          upsertFailed = true;
        }
        if (upsertResult.storageError) {
          storageError = upsertResult.storageError;
        }
      }

      if (upsertFailed) {
        return { saved: false, storageError };
      }

      const successCount = parsed.validRows.length;
      const failedCount = parsed.failedRows.length;
      const logStatus: UploadHistoryRecord['status'] =
        successCount > 0 && failedCount === 0
          ? 'success'
          : successCount > 0 && failedCount > 0
            ? 'partial'
            : 'failed';

      const newLog: UploadHistoryRecord = {
        id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName,
        uploadedAt: new Date().toISOString(),
        uploadedBy: adminSession?.nama || 'Admin Gudang',
        totalRows: parsed.totalRows,
        successCount,
        failedCount,
        duplicateMergedCount: parsed.duplicateMergedCount,
        sheetsProcessed: parsed.sheetsProcessed,
        status: logStatus,
        errors: parsed.failedRows.map((row) => ({
          rowNumber: row.rowNumber,
          partCode: row.rawPartCode,
          reason: row.sheetName ? `${row.sheetName}: ${row.reason}` : row.reason,
        })),
      };

      const logSave = await recordUploadHistory(newLog, adminSession?.userId);
      setUploadHistory(logSave.records);
      setUploadHistoryError(logSave.error);

      if (logSave.error && !storageError) {
        storageError = logSave.error;
      }

      return { saved: true, storageError };
    },
    [adminSession, parts]
  );

  const handleCloseCamera = useCallback(() => setIsCameraOpen(false), []);
  const handleCameraFallbackInput = useCallback(() => {
    cameraFallbackInputRef.current?.click();
  }, []);

  const handleSaveSinglePart = useCallback(
    async (payload: SinglePartUpdatePayload) => {
      const updatedList = await updateSinglePart(payload, parts);
      setParts(updatedList);
    },
    [parts]
  );

  if (!isSupabaseConfigured) {
    return (
      <ErrorFallbackPage
        mode="config"
        onGoHome={() => window.location.reload()}
      />
    );
  }

  if (isNotFoundRoute) {
    return (
      <ErrorFallbackPage
        mode="404"
        onGoHome={() => {
          window.history.pushState({}, '', '/');
          setIsNotFoundRoute(false);
        }}
      />
    );
  }

  return (
    <div ref={pageRef} className="relative flex min-h-screen flex-col bg-white text-[#18181B]">
      <WatermarkOverlay />

      <header className="relative z-30 flex items-center justify-between px-4 pt-3.5 sm:px-6 sm:pt-4">
        <div className="min-w-0">
          {hasSearched && (
            <button
              type="button"
              onClick={handleResetHome}
              aria-label="Kembali ke halaman awal PaP Asist"
              title="Kembali ke halaman awal PaP Asist"
              className="flex min-h-[44px] cursor-pointer flex-col items-center justify-center rounded-[8px] px-1.5 py-0.5 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              <img
                src="/honda-7.webp"
                alt="Honda"
                width={120}
                height={40}
                fetchPriority="high"
                className="h-4 w-auto shrink-0 select-none object-contain"
              />
              <span className="flex h-6 w-[84px] shrink-0 items-center justify-center overflow-hidden">
                <img
                  src="/PAP1.webp"
                  alt="PaP Asist"
                  width={2000}
                  height={2000}
                  fetchPriority="high"
                  className="h-[112px] w-[112px] max-w-none select-none object-contain mix-blend-multiply"
                />
              </span>
            </button>
          )}
        </div>

        <div className="hero-stagger flex items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={() => {
              setIsNotifOpen(false);
              setIsLoginOpen(false);
              setIsTableOpen(true);
            }}
            aria-label="Daftar Part"
            title="Daftar Part"
            className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
          >
            <Table size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => {
              setIsNotifOpen(false);
              setIsTableOpen(false);
              if (adminSession) {
                setIsAdminOpen(true);
              } else {
                setIsLoginOpen(true);
              }
            }}
            aria-label={
              adminSession
                ? `Buka Admin Asist (${adminSession.nama})`
                : 'Login Admin Gudang'
            }
            title={
              adminSession
                ? `Buka Admin Asist (${adminSession.nama})`
                : 'Login Admin Gudang'
            }
            className={`flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000] ${adminSession
                ? 'bg-[#CC0000] text-white hover:opacity-90'
                : 'text-[#18181B] hover:bg-[#F4F4F5]'
              }`}
          >
            {adminSession ? (
              <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Lock size={19} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>

          <NotificationMenu
            fastParts={lowStock.fast}
            slowParts={lowStock.slow}
            totalCount={lowStock.totalCount}
            isOpen={isNotifOpen}
            onToggle={() => setIsNotifOpen((prev) => !prev)}
            onClose={() => setIsNotifOpen(false)}
            onSelectPart={handleSelectNotifPart}
          />

          {adminSession && (
            <button
              type="button"
              onClick={() => {
                void handleLogout();
              }}
              aria-label="Keluar dari akun admin"
              title="Keluar"
              className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              <LogOut size={19} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <main
        className={`relative z-20 mx-auto flex w-full max-w-[680px] flex-1 flex-col px-4 ${hasSearched ? 'justify-start pt-4 sm:pt-5' : 'justify-center pb-16'
          }`}
      >
        <h1 className="sr-only">PaP Asist</h1>

        {!hasSearched && (
          <div className="mb-7 flex flex-col items-center text-center">
            <img
              src="/honda-7.webp"
              alt="Logo Honda"
              width={180}
              height={60}
              fetchPriority="high"
              className="hero-stagger mb-2 h-10 sm:h-12 w-auto select-none object-contain"
            />
            <div className="hero-stagger flex h-16 sm:h-20 w-[210px] sm:w-[250px] items-center justify-center overflow-hidden">
              <img
                src="/PAP1.webp"
                alt="PaP Asist"
                width={2000}
                height={2000}
                fetchPriority="high"
                className="h-[260px] w-[260px] sm:h-[310px] sm:w-[310px] max-w-none select-none object-contain mix-blend-multiply"
              />
            </div>
            <p className="hero-stagger mt-1 text-sm text-[#52525B]">
              Padang Panjang Part Asisten
            </p>
          </div>
        )}

        <div
          ref={searchDockRef}
          data-flip-id="pap-search-dock"
          className={!hasSearched ? 'hero-stagger w-full' : 'w-full'}
        >
          <SearchBar
            query={query}
            onQueryChange={setQuery}
            onSubmit={() => {
              void executeSearch();
            }}
            inputRef={searchInputRef}
            selectedImagePreview={selectedImagePreview}
            selectedImageName={selectedImageFile?.name ?? null}
            onSelectImage={(file) => {
              void handleSelectImage(file, false);
            }}
            onClearImage={handleClearImage}
            onOpenCamera={() => {
              setIsHistoryOpen(false);
              setIsNotifOpen(false);
              setIsCameraOpen(true);
            }}
            cameraFallbackInputRef={cameraFallbackInputRef}
            historyItems={historyItems}
            isHistoryOpen={isHistoryOpen}
            onFocusInput={() => setIsHistoryOpen(true)}
            onBlurInput={() => setIsHistoryOpen(false)}
            onSelectHistory={handleSelectHistory}
            onClearHistory={handleClearHistory}
            isLoading={status === 'loading'}
          />
        </div>

        {hasSearched && (
          <section aria-live="polite" className="mt-4 pb-10">
            {status === 'loading' && <SearchLoadingState mode={loadingMode} />}

            {status !== 'loading' && officialQueryName && status !== 'error' && (
              <p className="mb-4 text-xs sm:text-sm text-[#52525B]">
                Dicari sebagai:{' '}
                <span className="font-semibold text-[#18181B]">
                  {officialQueryName}
                </span>
              </p>
            )}

            {status === 'success' && (
              <div ref={resultsContainerRef} className="space-y-3">
                {results.map((part) => (
                  <ResultCard key={part.id} part={part} />
                ))}
                {searchNote && (
                  <p className="pt-1 text-xs text-[#52525B]">{searchNote}</p>
                )}
              </div>
            )}

            {status === 'empty' && (
              <div className="py-12 text-center text-sm text-[#52525B]">
                Part tidak ditemukan. Coba nama lain atau foto part.
              </div>
            )}
          </section>
        )}
      </main>

      {partsLoadError && (
        <footer className="relative z-20 px-4 py-4 text-center">
          <p role="alert" className="text-xs font-medium text-[#CC0000]">
            {partsLoadError}
          </p>
        </footer>
      )}

      <PartsTablePanel
        isOpen={isTableOpen}
        parts={parts}
        onClose={() => setIsTableOpen(false)}
      />

      <CameraModal
        isOpen={isCameraOpen}
        onClose={handleCloseCamera}
        onCapture={(file) => {
          void handleSelectImage(file, true);
        }}
        onFallbackInput={handleCameraFallbackInput}
      />

      <LoginModal
        isOpen={isLoginOpen}
        session={adminSession}
        onClose={() => setIsLoginOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        onLogout={() => {
          void handleLogout();
        }}
        onAuthFlowBusyChange={(busy) => {
          isPinFlowBusyRef.current = busy;
        }}
      />

      <AiNoticeModal
        notice={aiNotice}
        onClose={() => {
          const wasNonHonda = aiNotice?.type === 'non_honda_part';
          setAiNotice(null);
          if (wasNonHonda) {
            window.setTimeout(() => searchInputRef.current?.focus(), 60);
          }
        }}
        onRetrySearch={() => {
          const last = lastSearchPayloadRef.current;
          void executeSearch(last.query, last.image);
        }}
        onOpenPartsTable={() => setIsTableOpen(true)}
      />

      <Suspense fallback={null}>
        {isAdminOpen && (
          <AdminAsistPanel
            isOpen={isAdminOpen}
            session={adminSession}
            parts={parts}
            uploadHistoryCount={uploadHistory.length}
            onClose={() => setIsAdminOpen(false)}
            onOpenUpload={() => setIsUploadOpen(true)}
            onOpenHistory={() => setIsUploadHistoryOpen(true)}
            onOpenCredentials={() => setIsCredentialsOpen(true)}
            onRunEnrichBatch={async () => {
              const batchRes = await triggerEnrichPartsBatch(10);
              const refreshed = await fetchAllParts();
              if (!refreshed.error) {
                setParts(refreshed.parts);
              }
              return batchRes;
            }}
            onSaveSinglePart={handleSaveSinglePart}
            onLogout={() => {
              void handleLogout();
            }}
          />
        )}

        {isUploadOpen && (
          <UploadDataModal
            isOpen={isUploadOpen}
            onClose={() => setIsUploadOpen(false)}
            onProcessUpload={handleProcessUpload}
            onOpenHistory={() => setIsUploadHistoryOpen(true)}
          />
        )}

        {isUploadHistoryOpen && (
          <UploadHistoryPanel
            isOpen={isUploadHistoryOpen}
            records={uploadHistory}
            storageError={uploadHistoryError}
            onClose={() => setIsUploadHistoryOpen(false)}
          />
        )}

        {isCredentialsOpen && (
          <AdminCredentialsModal
            isOpen={isCredentialsOpen}
            session={adminSession}
            onClose={() => setIsCredentialsOpen(false)}
            onCredentialsUpdated={(updatedEmail) => {
              setAdminSession((prev) => (prev ? { ...prev, email: updatedEmail } : prev));
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
