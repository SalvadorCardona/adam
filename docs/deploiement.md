# Déployer le jeu et le serveur sur Dokploy

Le serveur (`server/`, voir CLAUDE.md « Back-end ») et le client tournent sur
le Dokploy de cardona.digital, deux services du projet **adam** :
le serveur construit depuis `server/Dockerfile`, le client depuis
`client/Dockerfile`. Le jeu ne parle au serveur que si `VITE_API_URL` est
fixée à son build.

**Pourquoi deux services** plutôt que le client servi par le serveur : le
serveur reste un pur back-end (Node, SQLite, volume), le client un site
statique (nginx) qui se reconstruit sans toucher à la base ni couper les
WebSockets ouverts. Le coût est un CORS (`CORS_ORIGINS`) et un second
enregistrement DNS.

Adresse retenue : **https://adam-api.cardona.digital** (wss:// sur le
même hôte, chemin `/ws`).

## 1. DNS (à la main)

Aucun joker `*.cardona.digital` n'existe : créer un enregistrement
`A adam-api.cardona.digital → 148.230.109.72` (l'IP de
`dokploy.cardona.digital`). Sans lui, Let's Encrypt ne délivre pas le certificat.

## 2. Service Dokploy

Projet **adam**, service **Application** `adam-server` :

- **Source** : GitHub, `SalvadorCardona/adam`, branche `main`,
  « Trigger type » *On push* (déploiement automatique) ;
- **Build** : type *Dockerfile*, Dockerfile `server/Dockerfile`, contexte `.`
  (la racine : le serveur importe `shared/`) ;
- **Volume** : *Volume mount* → `/data` (la base SQLite et ses sauvegardes :
  elle survit aux redéploiements) — `adam-data` sur une installation neuve ; en
  production, le volume d'origine, gardé sous son nom (section 6) ;
- **Domaine** : `adam-api.cardona.digital`, chemin `/`, port
  conteneur `8790`, HTTPS activé, certificat *Let's Encrypt* (Traefik transmet
  les WebSockets sans réglage) ;
- **Variables d'environnement** (onglet Environment, jamais commitées) :

  ```
  CORS_ORIGINS=https://cardona.digital,https://adam.cardona.digital
  INVITE_TTL_MINUTES=60
  ```

  `PORT`, `HOST` et `DATABASE_PATH` ont déjà leurs valeurs dans l'image. Aucun
  secret de session : le jeton est aléatoire et seule son empreinte SHA-256
  est en base.

Si le jeu est ouvert depuis une autre origine (domaine perso, `localhost`),
l'ajouter à `CORS_ORIGINS`, séparées par des virgules.

## 3. Sauvegarde

`server/src/backup.ts` copie la base à chaud (API de sauvegarde de SQLite)
dans `/data/backups/` et ne garde que les 14 plus récentes. Dans le service,
onglet **Schedules** : tâche `sauvegarde-sqlite`, cron `0 3 * * *`, type
*Application*, commande `node server/src/backup.ts`.

Les copies restent dans le même volume : pour les sortir du serveur, ajouter
une destination S3 dans *Settings → S3 Destinations* et une sauvegarde de
volume (*Volume Backups*) de ce volume.

## 4. Le client de production

### DNS (à la main)

Créer `A adam.cardona.digital → 148.230.109.72` (même IP que le
serveur). Sans lui, Let's Encrypt ne délivre pas le certificat.

### Service Dokploy

Projet **adam**, service **Application** `adam-client` :

- **Source** : GitHub, `SalvadorCardona/adam`, branche `main`,
  « Trigger type » *On push* ;
- **Build** : type *Dockerfile*, Dockerfile `client/Dockerfile`, contexte `.` ;
- **Build-time Arguments** (onglet Environment — pas les variables
  d'exécution : Vite fige `VITE_API_URL` dans le bundle) :

  ```
  VITE_API_URL=https://adam-api.cardona.digital
  ```

- **Domaine** : `adam.cardona.digital`, chemin `/`, port conteneur
  `80`, HTTPS activé, certificat *Let's Encrypt*.

nginx (`client/nginx.conf`) sert le jeu sous `/adam/` (la `base` de
`vite.config.ts`, comme sur GitHub Pages) et renvoie `/` vers ce chemin en
gardant la requête. Le lien d'invitation (`?join=`) et son QR code sont bâtis
sur l'adresse de la page : ils prennent donc `https://adam.cardona.digital/adam/?join=CODE`
sans réglage.

Essai local : `docker build -f client/Dockerfile --build-arg VITE_API_URL=… -t adam-client .`

### État en production

Créés dans Dokploy (projet **adam**) : le service `adam-client`
(GitHub `main`, Dockerfile `client/Dockerfile`, autodeploy, argument de build
`VITE_API_URL`), son domaine `adam.cardona.digital` (port 80, HTTPS,
Let's Encrypt) et le DNS chez Hostinger. `CORS_ORIGINS` du serveur contient le
nouveau domaine (vérifié : `access-control-allow-origin` renvoyé). Le premier
déploiement du client part à la fusion de la branche dans `main`, qui apporte
`client/Dockerfile`.

### Retirer GitHub Pages

Une fois le nouveau domaine validé (section 5) : *Settings → Pages → Build and
deployment → Source* sur « None » et supprimer `.github/workflows/deploy.yml`
(la variable `VITE_API_URL` du dépôt devient inutile). Mettre à jour
l'adresse du jeu dans le README, le portfolio cardona.digital et la page
Notion du projet. Ne pas laisser les deux versions en ligne : leurs
sauvegardes locales (`localStorage`) sont par origine et divergeraient.

## Vocal (WebRTC) : STUN, et TURN si besoin

Le vocal de la partie à deux (`src/net/voice.ts`) passe de navigateur à
navigateur : le serveur ne relaie que la **signalisation** (messages `voice` du
WebSocket, aux seuls membres de la salle), jamais le son. **Rien à déployer
pour qu'il marche** dans la plupart des cas : il utilise le STUN public de
Google (`src/net/iceServers.ts`). Le micro exige une page sécurisée (HTTPS,
ou `localhost`) — c'est le cas de `https://adam.cardona.digital/adam/`.

Derrière certains réseaux (4G d'opérateur, réseaux d'entreprise, NAT
symétrique), la connexion directe est impossible : le joueur voit « Connexion
vocale impossible avec <pseudo> ». Il faut alors un relais **TURN**
(coturn). Action manuelle, hors du code :

1. **coturn sur Dokploy** : un service Docker `coturn/coturn`, ports `3478`
   (UDP et TCP) et la plage UDP de relais (`49152-49252`) publiés sur l'hôte,
   `--lt-cred-mech --user adam:<mot de passe> --realm turn.cardona.digital
   --external-ip <IP publique>` ; DNS `A turn.cardona.digital → 148.230.109.72`
   (à la main, comme les autres). Pare-feu : ouvrir ces ports.
2. **Build-time Arguments** de `adam-client` (comme `VITE_API_URL`) :

   ```
   VITE_TURN_URL=turn:turn.cardona.digital:3478
   VITE_TURN_USERNAME=adam
   VITE_TURN_CREDENTIAL=<le mot de passe>
   ```

   Ces valeurs sont figées dans le bundle, donc lisibles par qui ouvre le
   jeu : acceptable pour commencer, mais des identifiants éphémères
   (`use-auth-secret`, générés par le serveur) seront préférables si le TURN
   sert beaucoup.
3. Redéployer `adam-client`.

Sans ces trois variables, le jeu reste sur le STUN seul, sans erreur.

## 5. Vérifier

```bash
curl https://adam-api.cardona.digital/health
npx wscat -c wss://adam-api.cardona.digital/ws -H "Origin: https://adam.cardona.digital"
curl -I https://adam.cardona.digital/
```

Parcours à deux, en production : A lance une partie, touche « Inviter un ami »
(le premier disque en haut à droite, ou la pause), entre un pseudo — aucun
compte n'est exigé — et obtient l'URL et le QR code sur le nouveau domaine ; B,
dans un autre navigateur (idéalement un téléphone), ouvre le lien, entre un
pseudo, « Rejoindre ». Vérifier que les deux personnages se voient, que ce que bâtit
l'un apparaît chez l'autre, que la déconnexion de B ne casse pas la partie de A.
Hors ligne et sans compte, le jeu se joue comme avant.

Un redéploiement (bouton *Deploy*, ou un push sur `main`) ne doit pas perdre
les comptes : se connecter avant et après.

## 6. Le renommage en Adam

Le jeu s'appelait autrement ; tout ce qui le nommait a pris le nom d'Adam
(`adam`, `/adam/`, `adam.cardona.digital`, `adam-api.cardona.digital`,
`SalvadorCardona/adam`). Rien ne se perd :

- **clés de l'appareil** : au démarrage, `src/storage/legacyKeys.ts` copie
  chaque clé de l'ancien préfixe vers `adam:*` si elle manque, puis retire
  l'ancienne ; il désinscrit l'ancien service worker et vide ses caches (même
  origine : GitHub Pages) ;
- **ancienne adresse du client** : nginx (`client/nginx.conf`, second bloc
  `server`) y sert la page de transfert `client/legacy/index.html` pour tout
  chemin. Elle lit les clés de cette origine, les compresse et les envoie dans
  le fragment (`https://adam.cardona.digital/adam/#import=…`, jamais dans la
  requête ni les journaux) ; le jeu les importe sans rien écraser et nettoie
  l'adresse. Pas de 301 pour le client, donc : une redirection perdrait les
  sauvegardes. L'ancien `sw.js` y est remplacé par `client/legacy/sw.js`, qui
  se désinscrit ;
- **base** : `DATABASE_PATH` prend le nouveau nom (`config.ts`), et
  `openDatabase` renomme l'ancien fichier (avec `-wal` et `-shm`) s'il est seul ;
- **CORS** : sans `CORS_ORIGINS`, le serveur accepte les nouvelles origines et
  l'ancienne ; en production, la variable doit les lister aussi.

Dans Dokploy, après fusion et sauvegarde de la base (*Schedules* → lancer
`sauvegarde-sqlite`, ou une *Volume Backup*) :

1. DNS : `A adam` et `A adam-api` → `148.230.109.72` (Hostinger) ;
2. renommer le projet et les services (`adam-server`, `adam-client`) — le
   volume garde son nom ;
3. `adam-client` : ajouter le domaine `adam.cardona.digital` (port 80,
   HTTPS) en **gardant** l'ancien domaine du client (il sert la page de
   transfert) ; argument de build `VITE_API_URL=https://adam-api.cardona.digital` ;
4. `adam-server` : ajouter `adam-api.cardona.digital` (port 8790, HTTPS) en
   gardant l'ancien domaine de l'API sur le même service, sans redirection —
   un `fetch` cross-origin ne suit pas une redirection de prévol CORS, et un
   client encore en cache doit joindre l'API ;
   `CORS_ORIGINS=https://cardona.digital,https://adam.cardona.digital,` suivi
   de l'ancienne origine du client ;
5. redéployer les deux, puis vérifier (section 5, `/health` → `service: "adam"`).

GitHub Pages : une fois le dépôt renommé, le jeu est sous
`salvadorcardona.github.io/adam/`. `cardona.digital/<projet>/` n'est pas servi
par Pages mais relayé par Traefik (dépôt du site, `deploy/traefik/github-pages.yml`,
copié dans `/etc/dokploy/traefik/dynamic/`) : y ajouter `/adam/` et `/adam` aux
deux règles, et renvoyer l'ancien chemin en 301 vers `/adam/` en gardant le
reste du chemin et la requête (le navigateur garde le fragment). Même origine :
les clés y sont communes, le jeu les renomme lui-même ; l'ancien service
worker, dont la page passe par le réseau d'abord, suit la redirection, et le
jeu le désinscrit. Relancer ensuite le workflow *Deploy* (build sous `/adam/`).

### État en production (renommage)

Faits : DNS `adam` et `adam-api` chez Hostinger ; sauvegarde de la base ; projet
Dokploy `adam`, services `adam-server` et `adam-client` (`appName` et volume
inchangés) ; domaines `adam-api.cardona.digital` (8790) et `adam.cardona.digital`
(80), HTTPS Let's Encrypt, les anciens gardés ; `CORS_ORIGINS` avec les trois
origines ; argument de build et variable du dépôt `VITE_API_URL` →
`https://adam-api.cardona.digital`.

Après fusion, faits le 2026-10-14 : dépôt renommé `SalvadorCardona/adam` ; source
GitHub des deux services Dokploy pointée sur `adam` (branche `main`) puis
redéployés (`/health` → `service: "adam"`) ; règles Traefik de `cardona.digital`
(`/adam/` et `/adam` ajoutés, `/mobile-factory` et `/mobile-factory/…` renvoyés
vers `/adam/…`, chemin et requête gardés — Traefik répond par un 308, redirection
permanente qui garde aussi la méthode) ; workflow *Deploy* relancé
(`https://cardona.digital/adam/`) ; transfert des clés vérifié de
`mobile-factory.cardona.digital` vers `adam.cardona.digital/adam/`.
