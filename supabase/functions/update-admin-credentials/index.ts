import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { getCorsHeaders } from '../_shared/cors.ts';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_REGEX = /^[0-9]{12}$/;

interface UpdateCredentialsPayload {
  currentPin?: string;
  newEmail?: string;
  newPassword?: string;
  newPin?: string;
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, { error: 'Metode tidak didukung. Gunakan permintaan POST.' }, 405);
  }

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').trim();
  const supabaseServiceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse(
      req,
      { error: 'Konfigurasi server autentikasi belum lengkap. Hubungi pengelola sistem.' },
      500
    );
  }

  const authHeader = req.headers.get('Authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = bearerMatch?.[1]?.trim() || '';

  if (!accessToken) {
    return jsonResponse(
      req,
      { error: 'Sesi login tidak ditemukan. Silakan masuk ulang sebagai admin.' },
      401
    );
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await serviceClient.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return jsonResponse(
      req,
      { error: 'Sesi login sudah berakhir atau tidak valid. Silakan masuk ulang.' },
      401
    );
  }

  const user = userData.user;

  const { data: adminProfile, error: profileError } = await serviceClient
    .from('admin_profiles')
    .select('user_id, full_name, email, role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (profileError || !adminProfile) {
    return jsonResponse(
      req,
      { error: 'Akses ditolak. Akun ini tidak terdaftar sebagai admin gudang aktif.' },
      403
    );
  }

  let body: UpdateCredentialsPayload;
  try {
    body = (await req.json()) as UpdateCredentialsPayload;
  } catch {
    return jsonResponse(req, { error: 'Format data JSON tidak valid.' }, 400);
  }

  const currentPin = typeof body.currentPin === 'string' ? body.currentPin.trim() : '';
  const newEmail = typeof body.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  const newPin = typeof body.newPin === 'string' ? body.newPin.trim() : '';

  if (!PIN_REGEX.test(currentPin)) {
    return jsonResponse(
      req,
      { error: 'PIN saat ini wajib diisi tepat 12 digit angka.' },
      400
    );
  }

  if (!newEmail && !newPassword && !newPin) {
    return jsonResponse(
      req,
      { error: 'Isi minimal satu kolom perubahan: email baru, password baru, atau PIN baru.' },
      400
    );
  }

  if (newEmail && !EMAIL_REGEX.test(newEmail)) {
    return jsonResponse(req, { error: 'Format email baru tidak valid.' }, 400);
  }

  if (newPassword && newPassword.length < 8) {
    return jsonResponse(req, { error: 'Password baru minimal 8 karakter.' }, 400);
  }

  if (newPin && !PIN_REGEX.test(newPin)) {
    return jsonResponse(req, { error: 'PIN baru harus tepat 12 digit angka.' }, 400);
  }

  const { data: pinVerified, error: pinCheckError } = await serviceClient.rpc(
    'verify_admin_pin_for_user',
    {
      p_user_id: user.id,
      p_pin: currentPin,
    }
  );

  if (pinCheckError || pinVerified !== true) {
    return jsonResponse(
      req,
      { error: 'PIN 12 digit saat ini tidak sesuai. Perubahan dibatalkan.' },
      403
    );
  }

  if (newEmail || newPassword) {
    const authUpdates: {
      email?: string;
      email_confirm?: boolean;
      password?: string;
      user_metadata?: Record<string, unknown>;
    } = {};

    if (newEmail) {
      authUpdates.email = newEmail;
      authUpdates.email_confirm = true;
    }
    if (newPassword) {
      authUpdates.password = newPassword;
    }
    authUpdates.user_metadata = { full_name: 'Pap Asist Admin' };

    const { error: updateAuthError } = await serviceClient.auth.admin.updateUserById(
      user.id,
      authUpdates
    );

    if (updateAuthError) {
      return jsonResponse(
        req,
        {
          error: `Gagal memperbarui akun autentikasi (${updateAuthError.message}). Periksa data lalu coba lagi.`,
        },
        400
      );
    }
  }

  const { data: updatedProfile, error: updateProfileError } = await serviceClient.rpc(
    'admin_update_profile_credentials',
    {
      p_user_id: user.id,
      p_new_email: newEmail || null,
      p_new_pin: newPin || null,
    }
  );

  if (updateProfileError) {
    return jsonResponse(
      req,
      { error: `Gagal memperbarui profil admin (${updateProfileError.message}).` },
      500
    );
  }

  const finalEmail =
    (updatedProfile as { email?: string } | null)?.email || newEmail || adminProfile.email;

  return jsonResponse(req, {
    ok: true,
    fullName: 'Pap Asist Admin',
    email: finalEmail,
    updated: {
      email: Boolean(newEmail),
      password: Boolean(newPassword),
      pin: Boolean(newPin),
    },
    message: 'Kredensial admin berhasil diperbarui.',
  });
});
