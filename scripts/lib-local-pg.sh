# Shared connection for the local SQL suites.
# Never a hosted Supabase project: no prod URL, no prod password.
if [[ "${PGHOST:-}" == *supabase.co* || "${PGHOST:-}" == *supabase.com* || "${DATABASE_URL:-}" == *supabase.co* || "${DATABASE_URL:-}" == *supabase.com* ]]; then
  echo "refusing hosted Supabase database" >&2
  exit 1
fi

if [[ -n "${PGHOST:-}" ]]; then
  export PGUSER="${PGUSER:-postgres}"
  export PGPASSWORD="${PGPASSWORD:-postgres}"
  export PGPORT="${PGPORT:-5432}"
  PSQL=(psql -v ON_ERROR_STOP=1 -X)
else
  PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1 -X)
fi
