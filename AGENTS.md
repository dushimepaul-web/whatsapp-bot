# WHATSAPP BOT - NUFOTEC

## Accès
- **URL**: http://localhost:9016
- **Email**: nufotecburundi2026@gmail.com
- **Mot de passe**: admin123
- **Téléphone bot**: 25779666439

## Règles de fonctionnement
1. Ne JAMAIS redémarrer le conteneur inutilement (risque d'expiration session WhatsApp)
2. Si session expirée → aller sur http://localhost:9016 → scanner le QR code
3. En cas de problème : `docker logs whatsapp-backend`

## Modération
- 223 groupes NUFOTEC = `isRestricted=true` (auto-détecté si le nom contient "nufotec" / "alimentation")
- Règle stricte : dans tout groupe `isRestricted=true` où le bot est admin, les membres ne peuvent envoyer QUE du texte original — transférés, médias et liens = suppression + avertissement @mention (les admins sont exemptés)
- Si le bot n'est pas admin du groupe → modération désactivée (pas de tentative de suppression)

## Commandes (dans CONTENT PREPARATION uniquement)
| Commande | Effet |
|---|---|
| `/help` | Liste des commandes |
| `/ping` | Test connexion |
| `/groupes` | Stats des groupes |
| `/broadcast <message>` | Diffusion vers tous les groupes visibles |
| `/logs` | Dernières actions |
| `/scan` | Détecte les groupes NUFOTEC à lier à la communauté |

## Fichiers critiques
- `backend/whatsapp/moderation.js` — Suppression médias/liens dans groupes restreints
- `backend/whatsapp/commands.js` — Commandes WhatsApp (/help, /ping, /broadcast, ...)
- `backend/services/whatsappService.js` — Connexion WhatsApp, keepalive 15s, reconnexion auto
- `backend/config/index.js` — CORS (localhost + IP), JWT
- `backend/controllers/settingsController.js` — Paramètres (rate limit, modération, auto-réponses)
- `frontend/src/context/SocketContext.js` — Socket.IO avec WebSocket + polling

## Architecture
```
Frontend (nginx:80) → port 9016
  └── /api/* → Backend (Express:3001)
  └── /socket.io → Backend (Socket.IO:3001)
Backend → MongoDB (whatsapp-bot)
Backend → WhatsApp (Baileys WebSocket)
```

## Notes techniques
- Le bot utilise `@whiskeysockets/baileys` v7.0.0-rc13
- Keepalive WebSocket toutes les 15s
- Reconnexion automatique après toute déconnexion (y compris loggedOut)
- Forwarding supprimé du codebase (oct. 2026) : plus de règles ni de file de transfert — les collections MongoDB `forwardingrules`, `forwardedmessages`, `pendingforwards` sont orphelines (à supprimer dans la BDD)