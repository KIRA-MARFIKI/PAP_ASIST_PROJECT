import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Eye, EyeOff, LogOut, RefreshCw, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { SurfaceWatermark } from './WatermarkOverlay';

export interface AdminSession {
  userId?: string;
  nama: string;
  email: string;
  role?: string;
}

interface LoginModalProps {
  isOpen: boolean;
  session: AdminSession | null;
  onClose: () => void;
  onLoginSuccess: (session: AdminSession) => void;
  onLogout: () => void;
  onAuthFlowBusyChange?: (busy: boolean) => void;
}

interface FormErrors {
  nama?: string;
  email?: string;
  password?: string;
  pin?: string;
  captcha?: string;
  form?: string;
}

interface VerifyPinResponse {
  verified: boolean;
  reason?: string | null;
  full_name: string | null;
  email?: string | null;
  role: string | null;
}

const REQUIRED_ADMIN_NAME = 'Pap Asist Admin';
// Hindari karakter ambigu (0/O, 1/I/l) agar captcha mudah dibaca.
const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateCaptchaCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * CAPTCHA_CHARS.length);
    code += CAPTCHA_CHARS[idx];
  }
  return code;
}

export function LoginModal({
  isOpen,
  session,
  onClose,
  onLoginSuccess,
  onLogout,
  onAuthFlowBusyChange,
}: LoginModalProps) {
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [captchaCode, setCaptchaCode] = useState(() => generateCaptchaCode());
  const [captchaInput, setCaptchaInput] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const captchaCanvasRef = useRef<HTMLCanvasElement>(null);
  const isClosingRef = useRef(false);
  const fallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
      }
    };
  }, []);

  const drawCaptcha = useCallback((code: string) => {
    const canvas = captchaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#F4F4F5';
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 5; i += 1) {
      ctx.strokeStyle = i % 2 === 0 ? '#D4D4D8' : '#E4E4E7';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(Math.random() * width, Math.random() * height);
      ctx.lineTo(Math.random() * width, Math.random() * height);
      ctx.stroke();
    }

    for (let i = 0; i < 24; i += 1) {
      ctx.fillStyle = '#A1A1AA';
      ctx.fillRect(Math.random() * width, Math.random() * height, 1.5, 1.5);
    }

    const step = width / (code.length + 1);
    for (let i = 0; i < code.length; i += 1) {
      const char = code[i];
      const angle = (Math.random() - 0.5) * 0.42;
      const offsetY = (Math.random() - 0.5) * 8;

      ctx.save();
      ctx.translate(step * (i + 1), height / 2 + offsetY);
      ctx.rotate(angle);
      ctx.font = '700 22px "Plus Jakarta Sans", monospace';
      ctx.fillStyle = i % 2 === 0 ? '#18181B' : '#3F3F46';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char, 0, 0);
      ctx.restore();
    }
  }, []);

  const refreshCaptcha = useCallback(() => {
    const nextCode = generateCaptchaCode();
    setCaptchaCode(nextCode);
    setCaptchaInput('');
  }, []);

  const handleClose = useCallback(() => {
    if (isClosingRef.current || isSubmitting) return;
    isClosingRef.current = true;

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
  }, [isSubmitting, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    isClosingRef.current = false;
    setErrors({});
    setIsSubmitting(false);
    if (!session) {
      const fresh = generateCaptchaCode();
      setCaptchaCode(fresh);
      setCaptchaInput('');
    }
  }, [isOpen, session]);

  useEffect(() => {
    if (!isOpen || session) return;
    drawCaptcha(captchaCode);
  }, [isOpen, session, captchaCode, drawCaptcha]);

  useEffect(() => {
    if (!isOpen) return;
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const nextErrors: FormErrors = {};
    const trimmedNama = nama.trim();
    const trimmedEmail = email.trim();
    const trimmedCaptcha = captchaInput.trim();

    if (!trimmedNama) {
      nextErrors.nama = 'Nama wajib diisi.';
    } else if (trimmedNama !== REQUIRED_ADMIN_NAME) {
      nextErrors.nama = 'Nama wajib diisi tepat sebagai Pap Asist Admin. Akses ditolak.';
    }
    if (!trimmedEmail) {
      nextErrors.email = 'Email wajib diisi.';
    } else if (!EMAIL_REGEX.test(trimmedEmail)) {
      nextErrors.email = 'Format email tidak valid.';
    }
    if (!password) {
      nextErrors.password = 'Password wajib diisi.';
    }
    if (!/^\d{12}$/.test(pin)) {
      nextErrors.pin = 'PIN harus tepat 12 digit angka.';
    }

    if (!trimmedCaptcha) {
      nextErrors.captcha = 'Kode captcha wajib diisi.';
    } else if (trimmedCaptcha.toUpperCase() !== captchaCode) {
      nextErrors.captcha = 'Kode captcha tidak sesuai. Kode baru telah dibuat, silakan coba lagi.';
      refreshCaptcha();
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    if (isSupabaseConfigured && supabase) {
      onAuthFlowBusyChange?.(true);
      let passwordSignedIn = false;
      let pinFullyVerified = false;
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (authError || !authData.user) {
          refreshCaptcha();
          setErrors({
            form: 'Email atau password tidak sesuai. Periksa kembali akun admin Anda lalu coba lagi.',
          });
          return;
        }

        passwordSignedIn = true;

        const { data: pinData, error: pinError } = await supabase.rpc('verify_admin_pin', {
          p_pin: pin,
          p_full_name: trimmedNama,
        });

        const parsedPin = pinData as VerifyPinResponse | null;

        if (pinError || !parsedPin?.verified) {
          // Segera akhiri sesi Auth bila PIN 12 digit gagal agar tidak ada sesi setengah terverifikasi.
          await supabase.auth.signOut();
          passwordSignedIn = false;
          refreshCaptcha();
          const reason = parsedPin?.reason || 'PIN 12 digit tidak valid atau akun belum terdaftar sebagai admin gudang.';
          if (reason.toLowerCase().includes('nama')) {
            setErrors({ nama: reason });
          } else {
            setErrors({ pin: reason });
          }
          return;
        }

        pinFullyVerified = true;
        onLoginSuccess({
          userId: authData.user.id,
          nama: parsedPin.full_name || REQUIRED_ADMIN_NAME,
          email: parsedPin.email || authData.user.email || trimmedEmail,
          role: parsedPin.role || 'warehouse_admin',
        });
        setPassword('');
        setPin('');
        setCaptchaInput('');
        onClose();
      } catch {
        if (passwordSignedIn && !pinFullyVerified) {
          await supabase.auth.signOut().catch(() => {});
        }
        refreshCaptcha();
        setErrors({
          form: 'Gagal terhubung ke layanan autentikasi Supabase. Periksa koneksi internet lalu coba lagi.',
        });
      } finally {
        setIsSubmitting(false);
        onAuthFlowBusyChange?.(false);
      }
      return;
    }

    // Mode fallback lokal saat variabel environment Supabase belum diatur.
    fallbackTimerRef.current = window.setTimeout(() => {
      fallbackTimerRef.current = null;
      setIsSubmitting(false);
      onLoginSuccess({ nama: trimmedNama, email: trimmedEmail, role: 'warehouse_admin' });
      setPassword('');
      setPin('');
      setCaptchaInput('');
      onClose();
    }, 350);
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
      aria-labelledby="login-modal-title"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-[8px] border border-[#E4E4E7] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
      >
        <SurfaceWatermark variant="light" />

        <div className="relative z-10">
          <div className="flex items-center justify-between border-b border-[#E4E4E7] px-5 py-3">
            <h2 id="login-modal-title" className="text-base font-bold text-[#18181B]">
              {session ? 'Akun Admin Gudang' : 'Login Admin Gudang'}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              aria-label="Tutup jendela login"
              title="Tutup"
              className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          {session ? (
            <div className="space-y-4 p-5">
              <div className="rounded-[8px] border border-[#E4E4E7] bg-white/95 p-4">
                <p className="text-xs font-medium text-[#52525B]">Sesi admin aktif</p>
                <p className="mt-1 text-base font-bold text-[#18181B]">{session.nama}</p>
                <p className="mt-0.5 text-sm text-[#52525B]">{session.email}</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                aria-label="Keluar dari akun admin"
                title="Keluar"
                className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-[8px] bg-[#CC0000] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
                <span>Keluar</span>
              </button>
            </div>
          ) : (
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
                  htmlFor="login-nama"
                  className="mb-1 block text-xs font-semibold text-[#18181B]"
                >
                  Nama
                </label>
                <input
                  id="login-nama"
                  type="text"
                  autoComplete="name"
                  value={nama}
                  onChange={(e) => {
                    setNama(e.target.value);
                    if (errors.nama) setErrors((prev) => ({ ...prev, nama: undefined }));
                  }}
                  placeholder="Pap Asist Admin"
                  className="min-h-[44px] w-full rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                />
                {errors.nama && (
                  <p className="mt-1 text-xs font-medium text-[#CC0000]">{errors.nama}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1 block text-xs font-semibold text-[#18181B]"
                >
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  placeholder="adminpapasist@papasist.com"
                  className="min-h-[44px] w-full rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                />
                {errors.email && (
                  <p className="mt-1 text-xs font-medium text-[#CC0000]">{errors.email}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1 block text-xs font-semibold text-[#18181B]"
                >
                  Password
                </label>
                <div className="flex gap-2">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
                    }}
                    placeholder="Masukkan password"
                    className="min-h-[44px] min-w-0 flex-1 rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#D4D4D8] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                  >
                    {showPassword ? (
                      <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs font-medium text-[#CC0000]">{errors.password}</p>
                )}
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label
                    htmlFor="login-pin"
                    className="block text-xs font-semibold text-[#18181B]"
                  >
                    PIN (12 Angka)
                  </label>
                  <span
                    className={`tabular-nums text-xs font-semibold ${
                      pin.length === 12 ? 'text-[#18181B]' : 'text-[#52525B]'
                    }`}
                  >
                    {pin.length}/12
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    id="login-pin"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={12}
                    value={pin}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 12);
                      setPin(digitsOnly);
                      if (errors.pin) setErrors((prev) => ({ ...prev, pin: undefined }));
                    }}
                    placeholder="Masukkan 12 digit PIN"
                    className="tabular-nums min-h-[44px] min-w-0 flex-1 rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((prev) => !prev)}
                    aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                    title={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                    className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#D4D4D8] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                  >
                    {showPin ? (
                      <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
                    ) : (
                      <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
                    )}
                  </button>
                </div>
                {errors.pin && (
                  <p className="mt-1 text-xs font-medium text-[#CC0000]">{errors.pin}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="login-captcha"
                  className="mb-1.5 block text-xs font-semibold text-[#18181B]"
                >
                  Captcha Acak
                </label>
                <div className="flex items-center gap-2.5">
                  <canvas
                    ref={captchaCanvasRef}
                    width={180}
                    height={52}
                    aria-label="Gambar kode captcha"
                    className="h-[52px] w-[180px] rounded-[8px] border border-[#D4D4D8] bg-[#F4F4F5]"
                  />
                  <button
                    type="button"
                    onClick={refreshCaptcha}
                    aria-label="Muat ulang captcha"
                    title="Muat ulang captcha"
                    className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#D4D4D8] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                  >
                    <RefreshCw size={18} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </div>
                <input
                  id="login-captcha"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={6}
                  value={captchaInput}
                  onChange={(e) => {
                    setCaptchaInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                    if (errors.captcha) setErrors((prev) => ({ ...prev, captcha: undefined }));
                  }}
                  placeholder="Ketik 6 karakter sesuai gambar (huruf kapital)"
                  className="mt-2 min-h-[44px] w-full rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                />
                {errors.captcha && (
                  <p className="mt-1 text-xs font-medium text-[#CC0000]">{errors.captcha}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-[44px] w-full cursor-pointer rounded-[8px] bg-[#CC0000] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
              >
                {isSubmitting ? 'Memverifikasi akun...' : 'Masuk'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
