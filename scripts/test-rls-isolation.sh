#!/usr/bin/env bash
# Apply every migration, in filename order, on a fresh LOCAL database.
# Then prove two households cannot read or write each other's money.
# Never points at a hosted Supabase project.
set -euo pipefail
cd "$(dirname "$0")/.."

DB=sanhuu_rls_isolation
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
for f in supabase/migrations/*.sql; do
  run "$f"
done
run tests/sql/60_isolation.sql

echo "household isolation: ok"
