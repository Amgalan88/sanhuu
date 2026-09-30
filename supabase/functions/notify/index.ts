// Supabase Edge Function: notify
// Нэг админ үйлдэл хийхэд НӨГӨӨ админы бүх төхөөрөмж рүү Web Push илгээнэ.
// { test: true } бол зөвхөн өөрийн төхөөрөмж рүү туршилтын мэдэгдэл.
//
// Secrets (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY автоматаар байдаг.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Дуудаж буй хэрэглэгч админ эсэх
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: 'unauthorized' }, 401);
    const { data: me } = await admin.from('admins').select('name, emoji').eq('user_id', user.id).maybeSingle();
    if (!me) return json({ error: 'forbidden' }, 403);

    const input = await req.json().catch(() => ({}));
    const test = input.test === true;
    const payload = JSON.stringify({
      title: String(input.title ?? `${me.emoji} ${me.name}`).slice(0, 80),
      body: String(input.body ?? '').slice(0, 240),
      tag: input.tag ? String(input.tag).slice(0, 60) : undefined,
      url: './',
    });

    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT') ?? 'https://github.com/Amgalan88/sanhuu',
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    );

    let q = admin.from('push_subscriptions').select('endpoint, p256dh, auth');
    q = test ? q.eq('user_id', user.id) : q.neq('user_id', user.id);
    const { data: subs, error } = await q;
    if (error) throw error;

    let sent = 0;
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        // Хүчингүй болсон (апп устгасан, зөвшөөрөл цуцалсан) төхөөрөмжийг цэвэрлэнэ
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        else console.error('push failed', code, (e as Error).message);
      }
    }));
    return json({ sent, devices: subs?.length ?? 0 });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
