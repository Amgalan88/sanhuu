# Migration history repair

Production (`evtawdwjlwniwjjimkfh`) recorded three migrations under versions that did not match the filenames in git. This branch renames the repo files to the versions that are known. **Do not run the commands below until you approve them.** They are not run by CI, and this change does not connect to production.

`migration repair` only inserts or deletes a row in `supabase_migrations.schema_migrations`. It does not run the SQL file.

## What matches today

| Migration | Production version | Repo file before this change | Repo file now |
| --- | --- | --- | --- |
| households | `20261115102321` | `20261115121500` | `20261115102321_households.sql` |
| phone_auth | `20261115105823` | `20261115190000` | `20261115105823_phone_auth.sql` |
| security_advisor_fixes | **not in the repo** | `20261114123000` | unchanged: `20261114123000_security_advisor_fixes.sql` |
| couple_chat | `20261031171342` | same | unchanged |
| baseline | recorded only as "already applied" in the old README, not as a pushed file | `20261031170000` | unchanged |

`security_advisor_fixes` could not be given a production version. Git history, pull request #4, and the README only ever name `20261114123000`. Pull request #4 said that file had not been applied yet. There is no later note of a different version. The filename stays `20261114123000` until `migration list` shows the real remote version.

The new file `20261123110000_phone_auth_search_path.sql` is **not** on production. Do not mark it applied with `migration repair`. Apply it only in the last step, after the history lines up.

## 1. Look first

From a checkout of this branch, after `npx supabase login`:

```bash
npx supabase link --project-ref evtawdwjlwniwjjimkfh
npx supabase migration list --linked
```

Read the table. Do not run `db push` yet.

If your CLI rejects `--linked` and still documents `--remote` (the flag used in the older README), use `--remote` in every repair command below. Same operation.

## 2. Repair the rows that are already known

Run these only if `migration list` still shows the old repo versions on the remote, or shows the production versions without a local file. Skip a command when that version is already in the state you want.

Households and phone auth, after this branch is checked out (local filenames are the production versions):

```bash
npx supabase migration repair --status reverted 20261115121500 --linked
npx supabase migration repair --status applied 20261115102321 --linked
npx supabase migration repair --status reverted 20261115190000 --linked
npx supabase migration repair --status applied 20261115105823 --linked
```

`reverted` deletes that version from the history table. `applied` inserts it. If the old version was never inserted, the `reverted` command reports that and changes nothing else. If the production version is already there, skip the matching `applied` command rather than inserting it twice.

Baseline was hand-applied and must not be executed again (it deletes mock rows). If `20261031170000` is missing from the remote history:

```bash
npx supabase migration repair --status applied 20261031170000 --linked
```

`20261031171342` (`couple_chat`) is already the production version. Do not repair it and do not edit that file.

## 3. security_advisor_fixes, after you see the remote version

If `migration list` shows local and remote both at `20261114123000`, do nothing to this file.

If the remote version is some other timestamp `YYYYMMDDHHMMSS`:

1. Do not run the SQL again.
2. Rename `supabase/migrations/20261114123000_security_advisor_fixes.sql` to `supabase/migrations/YYYYMMDDHHMMSS_security_advisor_fixes.sql` so the filename matches production.
3. Then:

```bash
npx supabase migration repair --status reverted 20261114123000 --linked
npx supabase migration repair --status applied YYYYMMDDHHMMSS --linked
```

Replace `YYYYMMDDHHMMSS` with the version from `migration list`. If `20261114123000` is not on the remote, skip the `reverted` command.

## 4. Apply only the new migration

When `migration list` shows every older local file as applied on the remote, and the only missing remote version is `20261123110000`:

```bash
npx supabase db push --linked
```

That runs `20261123110000_phone_auth_search_path.sql` only. It locks `search_path` on the phone-auth helpers and the phone-auth security-definer functions. It does not rewrite household data.

If `db push` wants to run baseline, households, phone auth, or security_advisor_fixes, stop. The history still does not match. Go back to steps 2 and 3. Do not push.

`db push` does not deploy the `notify` or `phone-auth` edge functions.
