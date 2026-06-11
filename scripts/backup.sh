#!/bin/bash
set -euo pipefail

# ============================================================
# AgentStudio Database Backup Script
# Usage: ./scripts/backup.sh [backup_dir]
# ============================================================

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
COMPOSE_FILE="docker-compose.prod.yml"

mkdir -p "$BACKUP_DIR"

echo "=== AgentStudio Backup ==="
echo "Timestamp: $TIMESTAMP"
echo "Backup dir: $BACKUP_DIR"

# PostgreSQL backup
echo ""
echo "[1/2] Backing up PostgreSQL..."
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U agentstudio agentstudio \
  > "$BACKUP_DIR/postgres_${TIMESTAMP}.sql"

if [ $? -eq 0 ]; then
  gzip "$BACKUP_DIR/postgres_${TIMESTAMP}.sql"
  echo "  -> $BACKUP_DIR/postgres_${TIMESTAMP}.sql.gz"
else
  echo "  -> PostgreSQL backup FAILED"
fi

# Redis backup
echo ""
echo "[2/2] Backing up Redis..."
docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli -a agentstudio BGSAVE
sleep 2
docker compose -f "$COMPOSE_FILE" cp redis:/data/dump.rdb "$BACKUP_DIR/redis_${TIMESTAMP}.rdb"

if [ $? -eq 0 ]; then
  echo "  -> $BACKUP_DIR/redis_${TIMESTAMP}.rdb"
else
  echo "  -> Redis backup FAILED"
fi

# Cleanup old backups (keep 30 days)
echo ""
echo "Cleaning up backups older than 30 days..."
find "$BACKUP_DIR" -type f -mtime +30 -delete

echo ""
echo "=== Backup Complete ==="
ls -lh "$BACKUP_DIR"/*_${TIMESTAMP}* 2>/dev/null
