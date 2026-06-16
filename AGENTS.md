# WHATSAPP BOT - NUFOTEC

## Accès
- **URL**: http://localhost:9016
- **Email**: nufotecburundi2026@gmail.com
- **Mot de passe**: admin123
- **Téléphone bot**: 25779666439

## Règles de fonctionnement
1. Ne JAMAIS redémarrer le conteneur inutilement (risque d'expiration session WhatsApp)
2. Si session expirée → aller sur http://localhost:9016 → scanner le QR code
3. Settings à ne PAS modifier dans l'UI :
   - `commandGroupName` = `CONTENT PREPARATION`
   - `masterGroupKeyword` = `GROUPES`
   - `inboxKeyword` = `INBOX`
   - `forwardingKeyword` = `NUFOTEC`
   - `autoRejectCalls` = `false`
4. Pour vérifier l'état : `/forwarding` dans CONTENT PREPARATION
5. En cas de problème : `docker logs whatsapp-backend`

## Règles de forwarding actives (2)
| Règle | Source | Cible | Type |
|---|---|---|---|
| MASTER GROUPES → NUFOTEC | Nº1.MASTER GROUPES | 223 groupes NUFOTEC | Groupe→Groupes |
| Nº2.MASTER INBOX → TOUS LES MEMBRES | Nº2.MASTER INBOX | 37534 membres NUFOTEC | Groupe→Membres |

## Modération
- 223 groupes NUFOTEC = `isRestricted=true`
- Médias et liens supprimés automatiquement pour les non-admins
- Avertissement envoyé avec @mention

## Commandes (dans CONTENT PREPARATION uniquement)
| Commande | Effet |
|---|---|
| `/help` | Liste des commandes |
| `/ping` | Test connexion |
| `/groupes` | Stats des groupes |
| `/forwarding` | État des règles + cibles exactes |
| `/broadcast <message>` | Diffusion vers tous les groupes NUFOTEC |
| `/list [page]` | Liste paginée des 223 groupes |
| `/stop` | Arrêt définitif du forwarding |
| `/resume` | Reprise du forwarding |
| `/stats` | Statistiques globales |
| `/logs` | Dernières actions |

## Fichiers critiques
- `backend/whatsapp/broadcastManager.js` — Logique de forwarding (handleIncoming, batch, queue)
- `backend/whatsapp/moderation.js` — Suppression médias/liens dans groupes restreints
- `backend/whatsapp/commands.js` — Commandes WhatsApp (/forwarding, /stop, etc.)
- `backend/services/defaultConfig.js` — Config appliquée à la connexion ($setOnInsert)
- `backend/services/whatsappService.js` — Connexion WhatsApp, keepalive 15s, reconnexion auto
- `backend/config/index.js` — CORS (localhost + IP), JWT
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
- Les settings sont protégés par `$setOnInsert` — jamais écrasés après création
- Keepalive WebSocket toutes les 15s
- Reconnexion automatique après toute déconnexion (y compris loggedOut)
- Forwarding persistant en BDD (PendingForward) avant envoi — crash proof
- Rate limit: 30 msg/min, 1s délai, 5000/jour
- `onlyAdmins: false` sur les 2 règles — tout membre peut déclencher le forwarding
