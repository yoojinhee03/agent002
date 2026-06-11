#!/bin/sh
set -e

# DB 준비 대기 (DATABASE_URL에서 host:port 추출)
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+):?([0-9]*).*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*@[^:]+:([0-9]+)/.*|\1|')
DB_PORT=${DB_PORT:-5432}

echo "Waiting for database at $DB_HOST:$DB_PORT ..."
until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  echo "  -> not ready, retrying in 2s..."
  sleep 2
done
echo "  -> database ready!"

echo "Running database migrations..."
./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma \
  && echo "  -> migrations applied" \
  || echo "  -> no pending migrations"

echo "Starting API server..."
exec su-exec nestjs "$@"
