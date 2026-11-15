// phone-auth — Verify.MN-ээр утас баталгаажуулж, Supabase хэрэглэгч үүсгэнэ / нууц үг солино.
//
// Нууц: VERIFY_MN_API_KEY (Edge Function secret). Клиент рүү хэзээ ч явуулахгүй.
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY платформ өөрөө өгнө. Service role зөвхөн энд.
//
// verify_jwt = false. Callback (Verify.MN GET) JWT-гүй. start/status/complete ч
// нэвтрээгүй хүн дуудна. Эрхийг challenge id + rate limit + service_role RPC хамгаална.
// Deploy: npx supabase functions deploy phone-auth --no-verify-jwt --project-ref <ref>
//
// Auth (dashboard, SQL биш):
//   1. Providers → Phone: ON. SMS provider (Twilio, MessageBird, Vonage, Textlocal) БҮҮ холбо.
//      Бид OTP илгээхгүй. signInWithPassword({ phone, password })-д provider л хэрэгтэй.
//   2. Phone confirmations: OFF. Хэрэв ассан ч admin createUser phone_confirm: true
//      тул хэрэглэгч аль хэдийн баталгаажсан, Supabase SMS явуулахгүй.
//   3. Email → Allow new users to sign up: OFF хэвээр (disable_signup). Имэйл нэвтрэлт
//      ажиллана. Шинэ утасны хэрэглэгчийг service role үүсгэнэ — public signup хэрэггүй.
//      Асаавал эвдэрсэн SMTP-ээр имэйл бүртгэл дахин нээгдэнэ.
//   4. Клиент complete-ийн дараа supabase.auth.signInWithPassword({ phone, password })
//      дуудна. Энэ функц session token буцаахгүй.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createVerifyMnClient, handlePhoneAuth } from './logic.js';

type Admin = ReturnType<typeof createClient>;

function dbFrom(admin: Admin) {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw error;
    return data;
  };
  return {
    countRecent: async ({ phone, ip, since }: { phone: string; ip: string; since: number }) => {
      const data = await rpc('phone_auth_count_recent', {
        p_phone: phone,
        p_ip: ip,
        p_since: new Date(since).toISOString(),
      }) as { phone_count: number; ip_count: number; latest: string | null };
      return { phoneCount: data.phone_count, ipCount: data.ip_count, latest: data.latest };
    },
    insert: (row: Record<string, unknown>) => rpc('phone_auth_insert', {
      p_id: row.id,
      p_phone: row.phone,
      p_purpose: row.purpose,
      p_code: row.code,
      p_expires_at: row.expires_at,
      p_ip: row.client_ip,
    }),
    get: (id: string) => rpc('phone_auth_get', { p_id: id }),
    save: (id: string, patch: Record<string, unknown>) => rpc('phone_auth_save', { p_id: id, p_patch: patch }),
    consume: (id: string) => rpc('phone_auth_consume', { p_id: id }),
    restore: (id: string) => rpc('phone_auth_restore', { p_id: id }),
  };
}

function authFrom(admin: Admin) {
  return {
    async findUserIdByPhone(phone: string) {
      const { data, error } = await admin.rpc('phone_auth_user_id', { p_phone: phone });
      if (error) throw error;
      return data ?? null;
    },
    async createPhoneUser({ phone, password }: { phone: string; password: string }) {
      const { error } = await admin.auth.admin.createUser({
        phone,
        password,
        phone_confirm: true,
      });
      if (error) throw error;
    },
    async updatePassword({ userId, password }: { userId: string; password: string }) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
    },
  };
}

Deno.serve((req) => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const apiKey = Deno.env.get('VERIFY_MN_API_KEY') ?? '';
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return handlePhoneAuth(req, {
    db: dbFrom(admin),
    auth: authFrom(admin),
    verify: createVerifyMnClient({ fetchImpl: fetch, apiKey }),
    apiKey,
    publicUrl: url,
    now: () => Date.now(),
    randomId: () => crypto.randomUUID(),
    randomCode: () => {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return String(buf[0] % 1_000_000).padStart(6, '0');
    },
  });
});
