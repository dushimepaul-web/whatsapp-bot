# WhatsApp Bot - Plateforme SaaS de Gestion WhatsApp

Plateforme complète de gestion et d'automatisation WhatsApp avec dashboard React, API REST, et architecture modulaire.

## Architecture

```
whatsapp-bot/
├── backend/          # API Express + Baileys + Socket.io
│   ├── config/       # Configuration
│   ├── controllers/  # Logique métier
│   ├── middlewares/   # Auth, rate limiting
│   ├── models/       # MongoDB (Mongoose)
│   ├── routes/       # API REST endpoints
│   ├── services/     # WhatsApp, Broadcast
│   ├── sockets/      # Socket.io temps réel
│   ├── utils/        # Helpers, logger
│   ├── whatsapp/     # Modération, groupes, broadcast
│   └── server.js     # Point d'entrée
├── frontend/         # Dashboard React
│   ├── src/
│   │   ├── pages/    # Login, Dashboard, Groups, etc.
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── context/
│   └── public/
├── docker-compose.yml
└── README.md
```

## Installation Locale

### Prérequis
- Node.js >= 18
- MongoDB (local ou Docker)
- npm

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Modifier .env si nécessaire
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm start
```

Accès: http://localhost:3000

## Installation VPS (Ubuntu)

```bash
# Installer Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs git

# Installer MongoDB
sudo apt install -y mongodb-org

# Cloner et configurer
git clone <votre-repo> whatsapp-bot
cd whatsapp-bot/backend
npm install --production
cp .env.example .env
nano .env  # Configurer JWT_SECRET, MONGODB_URI

# Installer PM2
npm install -g pm2
pm2 start pm2.config.js
pm2 save
pm2 startup

# Build frontend
cd ../frontend
npm install
npm run build
```

## Docker

```bash
docker-compose up -d
```

## PM2

```bash
cd backend
pm2 start pm2.config.js
pm2 save
pm2 startup
```

## API Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | /api/auth/register | Inscription |
| POST | /api/auth/login | Connexion |
| POST | /api/auth/refresh | Rafraîchir token |
| POST | /api/auth/logout | Déconnexion |
| GET | /api/whatsapp/status | Statut WhatsApp |
| POST | /api/whatsapp/connect | Connecter WhatsApp |
| POST | /api/whatsapp/disconnect | Déconnecter |
| GET | /api/groups | Liste groupes |
| GET | /api/groups/stats | Statistiques |
| GET | /api/groups/:id | Détail groupe |
| GET | /api/groups/:id/members | Membres du groupe |
| POST | /api/groups/refresh | Synchroniser |
| GET | /api/members | Liste membres |
| POST | /api/members/send-message | Message privé |
| GET/POST | /api/forwarding | Règles de forwarding |
| GET/POST | /api/broadcast | Campagnes broadcast |
| POST | /api/broadcast/:id/send | Envoyer campagne |
| GET/PUT | /api/settings | Paramètres |
| GET | /api/logs | Logs |

## Fonctionnalités

- Connexion WhatsApp via QR Code
- Gestion des groupes et membres
- Modération automatique (suppression des médias des membres)
- Diffusion de messages (broadcast)
- Règles de forwarding entre groupes
- Messages privés aux membres
- Anti-spam et rate limiting
- Dashboard temps réel via Socket.io
- Authentification JWT
- Docker et PM2 ready
