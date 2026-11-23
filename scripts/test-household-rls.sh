#!/usr/bin/env bash
# Apply the real migrations to a LOCAL Postgres, then prove isolation and rollback.
# Never points at a hosted Supabase project.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=sanhuu_household_test
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
run supabase/migrations/20261114132003_security_advisor_fixes.sql
run tests/sql/10_seed.sql
run supabase/migrations/20261115102321_households.sql
run tests/sql/20_rls.sql
run supabase/rollback/20261115102321_households.sql
run tests/sql/30_after_rollback.sql

echo "household RLS + rollback: ok"
