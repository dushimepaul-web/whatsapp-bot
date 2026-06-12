#!/bin/bash
# Génère un .env avec des secrets aléatoires si .env n'existe pas
ENV_FILE="$(dirname "$0")/../.env"
EXAMPLE_FILE="$(dirname "$0")/../.env.example"

if [ -f "$ENV_FILE" ]; then
  echo "ℹ️  .env existe déjà — aucune action nécessaire"
  exit 0
fi

if [ ! -f "$EXAMPLE_FILE" ]; then
  echo "❌ .env.example introuvable"
  exit 1
fi

JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "dev-fallback-secret-$(date +%s)")
JWT_REFRESH_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "dev-fallback-refresh-$(date +%s)")

sed -e "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" \
    -e "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" \
    "$EXAMPLE_FILE" > "$ENV_FILE"

echo "✅ .env généré avec des secrets aléatoires"
echo "   Fichier: $ENV_FILE"
