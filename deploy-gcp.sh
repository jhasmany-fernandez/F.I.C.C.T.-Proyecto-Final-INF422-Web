#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

cd "$ROOT_DIR"

echo "Desplegando stack productivo en Google Cloud VM..."
docker compose -f docker-compose.prod.yml up -d --build

echo "Servicios esperados:"
echo "Frontend: http://34.55.240.156:5656"
echo "Backend:  http://34.55.240.156:8787"
