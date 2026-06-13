#!/bin/sh
set -e

echo "Esperando a PostgreSQL..."
while ! nc -z "$DB_HOST" "$DB_PORT"; do
  sleep 1
done

echo "PostgreSQL disponible. Ejecutando migraciones..."
python manage.py migrate --noinput
python manage.py seed_admin
python manage.py runserver 0.0.0.0:8787
