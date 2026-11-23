import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGAL } from '../js/legal-config.js';
import { PRIVACY_MD, TERMS_MD } from '../js/legal-copy.js';
import { DRAFT_BANNER, applyLegalPlaceholders, renderLegalDocument } from '../js/legal.js';
import { CONSENT_REQUIRED, consentCheckboxHtml, consentRecord, signupAllowed } from '../js/consent.js';
import { buildHouseholdExport, exportFiles, toCsv } from '../js/export.js';
import { DELETE_CONFIRM_WORD, canConfirmDelete, renderDataSettings } from '../js/account.js';
import { renderPhonePassword, renderPhoneStart } from '../js/phone-auth.js';
import { SupabaseStore } from '../js/store.js';
import {
  HOUSEHOLD_TABLES, handleDeleteAccount, planAccountDeletion,
} from '../supabase/functions/delete-account/logic.js';

const HID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('[mocked] signup checkbox is required and not pre-checked', () => {
  assert.equal(signupAllowed(false), false);
  assert.equal(signupAllowed(undefined), false);
  assert.equal(signupAllowed(true), true);
  assert.match(CONSENT_REQUIRED, /зөвшөөрч байна/);

  const box = consentCheckboxHtml();
  assert.equal(/<input\b[^>]*\bchecked\b/.test(box), false);
  assert.match(box, /href="privacy\.html"/);
  assert.match(box, /href="terms\.html"/);
  assert.match(box, /Нууцлалын бодлого/);
  assert.match(box, /Үйлчилгээний нөхцөл/);
  assert.match(box, /зөвшөөрч байна/);

  const signup = renderPhonePassword({ purpose: 'signup' });
  const start = renderPhoneStart({ purpose: 'signup' });
  const reset = renderPhonePassword({ purpose: 'reset' });
  assert.match(signup, /id="consent"/);
  assert.match(start, /id="consent"/);
  assert.equal(/<input\b[^>]*\bchecked\b/.test(signup), false);
  assert.equal(/<input\b[^>]*\bchecked\b/.test(start), false);
  assert.equal(reset.includes('id="consent"'), false);
  assert.equal(renderPhoneStart({ purpose: 'reset' }).includes('id="consent"'), false);
});

test('[mocked] consent row stores the user, time, and policy version', () => {
  const row = consentRecord({
    userId: 'user-1',
    version: LEGAL.policyVersion,
    acceptedAt: '2026-11-23T03:00:00.000Z',
  });
  assert.deepEqual(row, {
    user_id: 'user-1',
    policy_version: 'draft-1',
    accepted_at: '2026-11-23T03:00:00.000Z',
  });
  assert.throws(() => consentRecord({ userId: '', version: 'draft-1', acceptedAt: 't' }));
});

test('[mocked] signed-up session writes a consents row for that user', async () => {
  const inserts = [];
  const store = new SupabaseStore('https://example.supabase.co', 'anon');
  store.userId = 'user-1';
  store.sb = {
    auth: {
      async updateUser() { return { error: null }; },
      async getUser() {
        return { data: { user: { user_metadata: {} } }, error: null };
      },
    },
    from(table) {
      assert.equal(table, 'consents');
      return {
        insert(row) {
          inserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  await store.recordConsent({ version: 'draft-1', acceptedAt: '2026-11-23T03:00:00.000Z' });
  assert.deepEqual(inserts, [{
    user_id: 'user-1',
    policy_version: 'draft-1',
    accepted_at: '2026-11-23T03:00:00.000Z',
  }]);
});

test('[mocked] export keeps only this household, including goal rows', () => {
  const bundle = buildHouseholdExport({
    exportedAt: '2026-11-23T03:00:00.000Z',
    householdId: HID,
    household: { id: HID, name: 'Манай өрх' },
    members: [
      { household_id: HID, user_id: 'me', name: 'Болд' },
      { household_id: OTHER, user_id: 'them', name: 'Өөр' },
    ],
    incomes: [
      { id: 'in-1', household_id: HID, amount: 1000, source: 'salary' },
      { id: 'in-x', household_id: OTHER, amount: 99999, source: 'salary' },
    ],
    expenses: [
      { id: 'ex-1', household_id: HID, amount: 50, category: 'food' },
      { id: 'ex-x', household_id: OTHER, amount: 77, category: 'food' },
    ],
    transfers: [
      { id: 'tr-1', household_id: HID, account: 'goal', amount: 200 },
      { id: 'tr-2', household_id: HID, account: 'household', amount: 600 },
      { id: 'tr-x', household_id: OTHER, account: 'goal', amount: 888 },
    ],
  });
  assert.equal(bundle.household.name, 'Манай өрх');
  assert.deepEqual(bundle.members.map((row) => row.user_id), ['me']);
  assert.deepEqual(bundle.incomes.map((row) => row.id), ['in-1']);
  assert.deepEqual(bundle.expenses.map((row) => row.id), ['ex-1']);
  assert.deepEqual(bundle.transfers.map((row) => row.id), ['tr-1', 'tr-2']);
  assert.deepEqual(bundle.goals.map((row) => row.id), ['tr-1']);
  assert.equal(JSON.stringify(bundle).includes('99999'), false);
  assert.equal(JSON.stringify(bundle).includes('888'), false);
  assert.equal(JSON.stringify(bundle).includes(OTHER), false);

  const csv = toCsv(bundle);
  assert.match(csv, /in-1/);
  assert.match(csv, /tr-1/);
  assert.equal(csv.includes('in-x'), false);
  assert.equal(csv.includes('99999'), false);
  const files = exportFiles(bundle);
  assert.deepEqual(files.map((file) => file.name), ['bidnii-sanhuu-2026-11-23.json', 'bidnii-sanhuu-2026-11-23.csv']);
  assert.match(files[0].text, /"amount": 1000/);
  assert.equal(files[0].text.includes('99999'), false);
});

function deletionHarness(members) {
  const calls = [];
  const deps = {
    auth: {
      async userFromJwt(token) {
        calls.push({ op: 'jwt', token });
        return token === 'good' ? { id: 'me' } : null;
      },
      async deleteUser(userId) {
        calls.push({ op: 'deleteUser', userId });
      },
    },
    db: {
      async listMembers() { return members; },
      async removeMember(householdId, userId) {
        calls.push({ op: 'removeMember', householdId, userId });
      },
      async deleteHousehold(householdId) {
        calls.push({ op: 'deleteHousehold', householdId });
      },
    },
  };
  return { calls, deps };
}

test('[mocked] last household member deletes the household data and the auth user', async () => {
  const { calls, deps } = deletionHarness([{ household_id: HID, user_id: 'me' }]);
  const res = await handleDeleteAccount(new Request('https://example.test', {
    method: 'POST',
    headers: { authorization: 'Bearer good' },
  }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, householdDeleted: true });
  assert.deepEqual(calls, [
    { op: 'jwt', token: 'good' },
    { op: 'deleteHousehold', householdId: HID },
    { op: 'deleteUser', userId: 'me' },
  ]);
  assert.equal(calls.some((call) => call.op === 'removeMember'), false);
  assert.equal(planAccountDeletion({
    userId: 'me',
    members: [{ household_id: HID, user_id: 'me' }],
  }).householdDeleted, true);
});

test('[mocked] other members stay, so only this member and the auth user go', async () => {
  const members = [
    { household_id: HID, user_id: 'me' },
    { household_id: HID, user_id: 'partner' },
    { household_id: OTHER, user_id: 'stranger' },
  ];
  const { calls, deps } = deletionHarness(members);
  const res = await handleDeleteAccount(new Request('https://example.test', {
    method: 'POST',
    headers: { authorization: 'Bearer good' },
  }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, householdDeleted: false });
  assert.deepEqual(calls, [
    { op: 'jwt', token: 'good' },
    { op: 'removeMember', householdId: HID, userId: 'me' },
    { op: 'deleteUser', userId: 'me' },
  ]);
  assert.equal(calls.some((call) => call.op === 'deleteHousehold'), false);
  assert.equal(calls.some((call) => call.householdId === OTHER), false);
});

test('[mocked] delete-account rejects a missing or bad token', async () => {
  const { calls, deps } = deletionHarness([{ household_id: HID, user_id: 'me' }]);
  const missing = await handleDeleteAccount(new Request('https://example.test', { method: 'POST' }), deps);
  assert.equal(missing.status, 401);
  const bad = await handleDeleteAccount(new Request('https://example.test', {
    method: 'POST',
    headers: { authorization: 'Bearer no' },
  }), deps);
  assert.equal(bad.status, 401);
  assert.equal(calls.some((call) => call.op === 'deleteUser' || call.op === 'deleteHousehold'), false);
});

test('[mocked] legal pages keep the draft, fill the region, and leave owner placeholders', () => {
  assert.equal(LEGAL.showDraftBanner, true);
  assert.equal(LEGAL.controllerName, '[ХУВЬ ХҮН/ААН-ИЙН НЭР]');
  assert.equal(LEGAL.email, '[И-МЭЙЛ]');
  assert.equal(LEGAL.phone, '[УТАС]');
  assert.equal(LEGAL.effectiveDate, '[ОГНОО]');
  assert.equal(LEGAL.responseDays, '[30]');

  const privacy = renderLegalDocument('privacy');
  const terms = renderLegalDocument('terms');
  assert.equal(privacy.banner, DRAFT_BANNER);
  assert.equal(terms.banner, 'Ноорог — хуульчаар хянуулаагүй');
  assert.match(privacy.text, /Япон \(Токио, ap-northeast-1\)/);
  assert.equal(privacy.text.includes('[БҮС НУТАГ]'), false);
  assert.match(privacy.text, /\[ХУВЬ ХҮН\/ААН-ИЙН НЭР\]/);
  assert.match(privacy.text, /\[И-МЭЙЛ\]/);
  assert.match(privacy.text, /\[УТАС\]/);
  assert.match(privacy.text, /\[ОГНОО\]/);
  assert.match(privacy.text, /\[30\]/);
  assert.match(privacy.html, /legal-ph/);
  assert.match(terms.text, /60\/20\/20/);
  assert.match(terms.text, /\[И-МЭЙЛ\]/);
  assert.match(PRIVACY_MD, /\[БҮС НУТАГ\]/);
  assert.equal(applyLegalPlaceholders(TERMS_MD, { ...LEGAL, showDraftBanner: false }).includes('[ОГНОО]'), true);
  assert.equal(renderLegalDocument('privacy', { ...LEGAL, showDraftBanner: false }).banner, '');

  const settings = renderDataSettings({ demo: false });
  assert.match(settings, /Мэдээлэл татах/);
  assert.match(settings, /Данс устгах/);
  assert.match(settings, /href="privacy\.html"/);
  assert.match(settings, /href="terms\.html"/);
  assert.equal(canConfirmDelete('устгах'), true);
  assert.equal(canConfirmDelete('  УСТГАХ  '), true);
  assert.equal(canConfirmDelete('устах'), false);
  assert.equal(DELETE_CONFIRM_WORD, 'УСТГАХ');
});

test('[mocked] delete-account source verifies the JWT and deletes household tables only together', () => {
  const src = readFileSync(new URL('../supabase/functions/delete-account/index.ts', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../supabase/migrations/20261123153000_legal_consents.sql', import.meta.url), 'utf8');
  const logic = readFileSync(new URL('../supabase/functions/delete-account/logic.js', import.meta.url), 'utf8');
  assert.match(src, /getUser\(jwt\)/);
  assert.match(src, /admin\.deleteUser/);
  assert.match(src, /for \(const table of HOUSEHOLD_TABLES\)/);
  assert.match(src, /\.delete\(\)\.eq\('household_id', householdId\)/);
  for (const table of HOUSEHOLD_TABLES) assert.match(logic, new RegExp(`'${table}'`));
  assert.match(config, /\[functions\.delete-account\]\s+verify_jwt = true/);
  assert.match(migration, /consents_select/);
  assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /grant select, insert on table public\.consents to authenticated/);
  assert.match(migration, /grant execute on function private\.consents_stamp\(\) to authenticated/);
  assert.equal(migration.includes('grant update'), false);
  assert.equal(migration.includes('grant delete'), false);
});
