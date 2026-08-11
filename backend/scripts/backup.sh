#!/bin/bash
BACKUP_DIR="/database/backups"
DB_NAME="whatsapp-bot"
MAX_BACKUPS=7
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_PATH="$BACKUP_DIR/${DB_NAME}_$TIMESTAMP"

mkdir -p "$BACKUP_DIR"

docker exec whatsapp-mongodb mongodump --db "$DB_NAME" --out "$BACKUP_PATH" 2>/dev/null

if [ $? -eq 0 ]; then
  tar -czf "${BACKUP_PATH}.tar.gz" -C "$BACKUP_DIR" "${DB_NAME}_$TIMESTAMP" 2>/dev/null
  rm -rf "$BACKUP_PATH"
  echo "Backup réussi: ${BACKUP_PATH}.tar.gz"
else
  echo "ERREUR: mongodump a échoué"
  exit 1
fi

# Supprime les backups plus vieux que $MAX_BACKUPS jours
find "$BACKUP_DIR" -name "${DB_NAME}_*.tar.gz" -mtime +$MAX_BACKUPS -delete
echo "Nettoyage terminé: backups conservés = $(ls $BACKUP_DIR/${DB_NAME}_*.tar.gz 2>/dev/null | wc -l)"
