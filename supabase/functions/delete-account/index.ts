// delete-account — нэвтэрсэн хэрэглэгчийн дансыг устгана.
//
// JWT-г энд дахин шалгана (getUser). Service role зөвхөн серверт.
// Сүүлийн гишүүн бол өрхийн мөрүүдийг устгана. Өөр гишүүн үлдвэл
// зөвхөн энэ хүний гишүүнчлэлийг хасна. Дараа нь auth хэрэглэгчийг устгана.
//
// Байршуулаагүй. Эзэн зөвшөөрсний дараа:
//   npx supabase functions deploy delete-account --project-ref evtawdwjlwniwjjimkfh
// --no-verify-jwt бүү өг. Эхлээд 20261123153000_legal_consents.sql миграцийг ажиллуулна.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { HOUSEHOLD_TABLES, handleDeleteAccount } from './logic.js';

const BUCKET = 'achievements';

function missingTable(error) {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

function thumbOf(path) {
  return path.replace(/\.jpg$/, '_t.jpg');
}

async function storagePaths(admin, householdId) {
  const paths = [];
  const { data: files, error: filesError } = await admin.from('achievements')
    .select('image_path')
    .eq('household_id', householdId);
  if (filesError) throw filesError;
  for (const row of files || []) {
    if (!row.image_path) continue;
    paths.push(row.image_path, thumbOf(row.image_path));
  }
  const { data: members, error: membersError } = await admin.from('household_members')
    .select('avatar_path')
    .eq('household_id', householdId);
  if (membersError) throw membersError;
  for (const row of members || []) if (row.avatar_path) paths.push(row.avatar_path);
  return paths;
}

function dbFrom(admin) {
  return {
    async listMembers(userId) {
      const { data: mine, error } = await admin.from('household_members')
        .select('household_id, user_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!mine) return [];
      const { data, error: listError } = await admin.from('household_members')
        .select('household_id, user_id')
        .eq('household_id', mine.household_id);
      if (listError) throw listError;
      return data || [];
    },
    async removeMember(householdId, userId) {
      const { data, error: readError } = await admin.from('household_members')
        .select('avatar_path')
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .maybeSingle();
      if (readError) throw readError;
      if (data?.avatar_path) {
        const { error: storageError } = await admin.storage.from(BUCKET).remove([data.avatar_path]);
        if (storageError) throw storageError;
      }
      const { error } = await admin.from('household_members')
        .delete()
        .eq('household_id', householdId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    async deleteHousehold(householdId) {
      const paths = await storagePaths(admin, householdId);
      if (paths.length) {
        const { error } = await admin.storage.from(BUCKET).remove(paths);
        if (error) throw error;
      }
      for (const table of HOUSEHOLD_TABLES) {
        const { error } = await admin.from(table).delete().eq('household_id', householdId);
        if (error && !missingTable(error)) throw error;
      }
      const { error } = await admin.from('households').delete().eq('id', householdId);
      if (error) throw error;
    },
  };
}

function authFrom(url, anonKey, admin) {
  return {
    async userFromJwt(jwt) {
      const client = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.getUser(jwt);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },
    async deleteUser(userId) {
      const { error: consentError } = await admin.from('consents').delete().eq('user_id', userId);
      if (consentError && !missingTable(consentError)) throw consentError;
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
  };
}

Deno.serve((req) => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return handleDeleteAccount(req, {
    db: dbFrom(admin),
    auth: authFrom(url, anonKey, admin),
  });
});
