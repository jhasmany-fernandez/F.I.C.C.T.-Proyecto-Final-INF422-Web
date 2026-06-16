#!/bin/sh
set -eu

ORIGINAL_ENTRYPOINT="/usr/local/bin/docker-entrypoint.sh"
POSTGRES_USER_VALUE="${POSTGRES_USER:-postgres}"
POSTGRES_DB_VALUE="${POSTGRES_DB:-postgres}"
POSTGRES_PASSWORD_VALUE="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_PORT_VALUE="${PGPORT:-5432}"

"$ORIGINAL_ENTRYPOINT" "$@" &
postgres_pid=$!

cleanup() {
  if kill -0 "$postgres_pid" 2>/dev/null; then
    kill "$postgres_pid" 2>/dev/null || true
    wait "$postgres_pid" || true
  fi
}

trap cleanup INT TERM

if [ "${1:-}" = "postgres" ]; then
  echo "Esperando a PostgreSQL para sincronizar credenciales de desarrollo..."
  while ! pg_isready -h 127.0.0.1 -p "$POSTGRES_PORT_VALUE" -U "$POSTGRES_USER_VALUE" -d "$POSTGRES_DB_VALUE" >/dev/null 2>&1; do
    if ! kill -0 "$postgres_pid" 2>/dev/null; then
      wait "$postgres_pid"
      exit 1
    fi
    sleep 1
  done

  escaped_password=$(printf "%s" "$POSTGRES_PASSWORD_VALUE" | sed "s/'/''/g")
  su postgres -c "psql -v ON_ERROR_STOP=1 -d \"$POSTGRES_DB_VALUE\" -c \"ALTER USER \\\"$POSTGRES_USER_VALUE\\\" WITH PASSWORD '$escaped_password';\"" >/dev/null
  echo "Credenciales de PostgreSQL sincronizadas con POSTGRES_PASSWORD."
fi

wait "$postgres_pid"
