import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { Eye, EyeOff, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { AdminSession } from './LoginModal';
import { SurfaceWatermark } from './WatermarkOverlay';

interface AdminCredentialsModalProps {
  isOpen: boolean;
  session: AdminSession | null;
  onClose: () => void;
  onCredentialsUpdated: (newEmail: string) => void;
}

interface CredentialFormErrors {
  currentPin?: string;
  newEmail?: string;
  newPassword?: string;
  newPin?: string;
  form?: string;
}

interface UpdateCredentialsResponse {
  ok?: boolean;
  email?: string;
  fullName?: string;
  message?: string;
  error?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AdminCredentialsModal({
  isOpen,
  session,
  onClose,
  onCredentialsUpdated,
}: AdminCredentialsModalProps) {
  const [currentPin, setCurrentPin] = useState('');
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [errors, setErrors] = useState<CredentialFormErrors>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isClosingRef = useRef(false);

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
    setCurrentPin('');
    setNewEmail('');
    setNewPassword('');
    setNewPin('');
    setErrors({});
    setSuccessMessage('');
    setIsSubmitting(false);
  }, [isOpen]);

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
        e.stopPropagation();
        handleClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleClose]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const nextErrors: CredentialFormErrors = {};
    const trimmedEmail = newEmail.trim().toLowerCase();
    const trimmedPin = newPin.trim();

    if (!/^\d{12}$/.test(currentPin)) {
      nextErrors.currentPin = 'PIN saat ini wajib tepat 12 digit angka.';
    }

    if (!trimmedEmail && !newPassword && !trimmedPin) {
      nextErrors.form = 'Isi minimal satu perubahan: email baru, password baru, atau PIN baru.';
    }

    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      nextErrors.newEmail = 'Format email baru tidak valid.';
    }

    if (newPassword && newPassword.length < 8) {
      nextErrors.newPassword = 'Password baru minimal 8 karakter.';
    }

    if (trimmedPin && !/^\d{12}$/.test(trimmedPin)) {
      nextErrors.newPin = 'PIN baru harus tepat 12 digit angka.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSuccessMessage('');

    if (!isSupabaseConfigured || !supabase) {
      setErrors({
        form: 'Supabase belum terhubung. Pengubahan kredensial hanya tersedia pada koneksi server aktif.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke<UpdateCredentialsResponse>(
        'update-admin-credentials',
        {
          body: {
            currentPin,
            ...(trimmedEmail ? { newEmail: trimmedEmail } : {}),
            ...(newPassword ? { newPassword } : {}),
            ...(trimmedPin ? { newPin: trimmedPin } : {}),
          },
        }
      );

      if (error) {
        let message = 'Gagal memperbarui kredensial admin. Periksa PIN saat ini lalu coba lagi.';
        const errContext = (error as { context?: Response }).context;
        if (errContext) {
          try {
            const parsed = (await errContext.json()) as { error?: string };
            if (parsed?.error) message = parsed.error;
          } catch {
            // Gunakan pesan fallback
          }
        }
        setErrors({ form: message });
        return;
      }

      if (!data?.ok) {
        setErrors({
          form: data?.error || 'Pembaruan kredensial tidak dapat diproses. Silakan coba lagi.',
        });
        return;
      }

      if (trimmedEmail || newPassword) {
        await supabase.auth.refreshSession().catch(() => {});
      }

      if (data.email) {
        onCredentialsUpdated(data.email);
      }

      setSuccessMessage(data.message || 'Kredensial admin berhasil diperbarui.');
      setCurrentPin('');
      setNewEmail('');
      setNewPassword('');
      setNewPin('');
    } catch {
      setErrors({
        form: 'Koneksi ke server terganggu. Periksa jaringan internet lalu coba lagi.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !session) return null;

  return (
    <div
      ref={backdropRef}
      onMouseDown={(e) => {
        if (e.target === backdropRef.current) handleClose();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credentials-modal-title"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-[8px] border border-[#E4E4E7] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
      >
        <SurfaceWatermark variant="light" />

        <div className="relative z-10">
          <div className="flex items-center justify-between border-b border-[#E4E4E7] px-5 py-3">
            <h2 id="credentials-modal-title" className="text-base font-bold text-[#18181B]">
              Ubah Kredensial Admin
            </h2>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              aria-label="Tutup jendela ubah kredensial"
              title="Tutup"
              className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[8px] border border-[#E4E4E7] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              <X size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4 p-5">
            <div className="rounded-[8px] border border-[#E4E4E7] bg-[#FAFAFA] px-3.5 py-2.5 text-xs">
              <p className="font-semibold text-[#18181B]">Nama Admin (Terkunci): {session.nama}</p>
              <p className="mt-0.5 text-[#52525B]">Email aktif: {session.email}</p>
            </div>

            {errors.form && (
              <div
                role="alert"
                className="rounded-[8px] border border-[#CC0000]/30 bg-[#FEF2F2] px-3.5 py-2.5 text-xs font-medium text-[#991B1B]"
              >
                {errors.form}
              </div>
            )}

            {successMessage && (
              <div
                role="status"
                className="rounded-[8px] border border-[#166534]/30 bg-[#F0FDF4] px-3.5 py-2.5 text-xs font-medium text-[#166534]"
              >
                {successMessage}
              </div>
            )}

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label
                  htmlFor="cred-current-pin"
                  className="block text-xs font-semibold text-[#18181B]"
                >
                  PIN Saat Ini (12 Angka, Wajib)
                </label>
                <span className="tabular-nums text-xs font-semibold text-[#52525B]">
                  {currentPin.length}/12
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  id="cred-current-pin"
                  type={showCurrentPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={12}
                  value={currentPin}
                  onChange={(e) => {
                    setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 12));
                    if (errors.currentPin) setErrors((prev) => ({ ...prev, currentPin: undefined }));
                  }}
                  placeholder="Konfirmasi 12 digit PIN saat ini"
                  className="tabular-nums min-h-[44px] min-w-0 flex-1 rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPin((prev) => !prev)}
                  aria-label={showCurrentPin ? 'Sembunyikan PIN saat ini' : 'Tampilkan PIN saat ini'}
                  title={showCurrentPin ? 'Sembunyikan PIN saat ini' : 'Tampilkan PIN saat ini'}
                  className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#D4D4D8] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                >
                  {showCurrentPin ? (
                    <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.currentPin && (
                <p className="mt-1 text-xs font-medium text-[#CC0000]">{errors.currentPin}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="cred-new-email"
                className="mb-1 block text-xs font-semibold text-[#18181B]"
              >
                Email Baru (Opsional)
              </label>
              <input
                id="cred-new-email"
                type="email"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  if (errors.newEmail) setErrors((prev) => ({ ...prev, newEmail: undefined }));
                }}
                placeholder="Kosongkan jika tidak mengubah email"
                className="min-h-[44px] w-full rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
              />
              {errors.newEmail && (
                <p className="mt-1 text-xs font-medium text-[#CC0000]">{errors.newEmail}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="cred-new-password"
                className="mb-1 block text-xs font-semibold text-[#18181B]"
              >
                Password Baru (Opsional, min. 8 karakter)
              </label>
              <div className="flex gap-2">
                <input
                  id="cred-new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (errors.newPassword) {
                      setErrors((prev) => ({ ...prev, newPassword: undefined }));
                    }
                  }}
                  placeholder="Kosongkan jika tidak mengubah password"
                  className="min-h-[44px] min-w-0 flex-1 rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? 'Sembunyikan password baru' : 'Tampilkan password baru'}
                  title={showNewPassword ? 'Sembunyikan password baru' : 'Tampilkan password baru'}
                  className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#D4D4D8] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                >
                  {showNewPassword ? (
                    <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.newPassword && (
                <p className="mt-1 text-xs font-medium text-[#CC0000]">{errors.newPassword}</p>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label
                  htmlFor="cred-new-pin"
                  className="block text-xs font-semibold text-[#18181B]"
                >
                  PIN Baru (Opsional, 12 Angka)
                </label>
                <span className="tabular-nums text-xs font-semibold text-[#52525B]">
                  {newPin.length}/12
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  id="cred-new-pin"
                  type={showNewPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={12}
                  value={newPin}
                  onChange={(e) => {
                    setNewPin(e.target.value.replace(/\D/g, '').slice(0, 12));
                    if (errors.newPin) setErrors((prev) => ({ ...prev, newPin: undefined }));
                  }}
                  placeholder="Kosongkan jika tidak mengubah PIN"
                  className="tabular-nums min-h-[44px] min-w-0 flex-1 rounded-[8px] border border-[#D4D4D8] bg-white/95 px-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus-visible:border-[#CC0000] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#CC0000]"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPin((prev) => !prev)}
                  aria-label={showNewPin ? 'Sembunyikan PIN baru' : 'Tampilkan PIN baru'}
                  title={showNewPin ? 'Sembunyikan PIN baru' : 'Tampilkan PIN baru'}
                  className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#D4D4D8] bg-white text-[#18181B] transition-colors hover:bg-[#F4F4F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
                >
                  {showNewPin ? (
                    <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" />
                  ) : (
                    <Eye size={18} strokeWidth={1.75} aria-hidden="true" />
                  )}
                </button>
              </div>
              {errors.newPin && (
                <p className="mt-1 text-xs font-medium text-[#CC0000]">{errors.newPin}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[44px] w-full cursor-pointer rounded-[8px] bg-[#CC0000] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CC0000]"
            >
              {isSubmitting ? 'Menyimpan kredensial...' : 'Simpan Perubahan'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
