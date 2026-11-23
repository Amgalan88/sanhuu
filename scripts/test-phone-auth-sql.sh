#!/usr/bin/env bash
# Apply migrations to a LOCAL Postgres and check phone-auth RLS, consume, rollback.
# Never points at a hosted Supabase project.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=sanhuu_phone_auth_test
# shellcheck source=lib-local-pg.sh
source "$(dirname "$0")/lib-local-pg.sh"

"${PSQL[@]}" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB}' AND pid <> pg_backend_pid();" >/dev/null
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS ${DB};"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE ${DB};"

run() {
  echo "== $1"
  "${PSQL[@]}" -d "$DB" -f "$1"
}

run tests/sql/00_stub.sql
run supabase/migrations/20261031170000_baseline.sql
run supabase/migrations/20261031171342_couple_chat.sql
run supabase/migrations/20261114123000_security_advisor_fixes.sql
run supabase/migrations/20261115102321_households.sql
run supabase/migrations/20261115105823_phone_auth.sql
run supabase/migrations/20261123110000_phone_auth_search_path.sql
run tests/sql/40_phone_auth.sql
run supabase/rollback/20261115105823_phone_auth.sql
run tests/sql/50_phone_auth_after_rollback.sql

echo "phone auth SQL + rollback: ok"
