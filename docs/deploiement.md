# Déployer le jeu et le serveur sur Dokploy

Le serveur (`server/`, voir CLAUDE.md « Back-end ») et le client tournent sur
le Dokploy de cardona.digital, deux services du projet **mobile-factory** :
le serveur construit depuis `server/Dockerfile`, le client depuis
`client/Dockerfile`. Le jeu ne parle au serveur que si `VITE_API_URL` est
fixée à son build.

**Pourquoi deux services** plutôt que le client servi par le serveur : le
serveur reste un pur back-end (Node, SQLite, volume), le client un site
statique (nginx) qui se reconstruit sans toucher à la base ni couper les
WebSockets ouverts. Le coût est un CORS (`CORS_ORIGINS`) et un second
enregistrement DNS.

Adresse retenue : **https://mobile-factory-api.cardona.digital** (wss:// sur le
même hôte, chemin `/ws`).

## 1. DNS (à la main)

Aucun joker `*.cardona.digital` n'existe : créer un enregistrement
`A mobile-factory-api.cardona.digital → 148.230.109.72` (l'IP de
`dokploy.cardona.digital`). Sans lui, Let's Encrypt ne délivre pas le certificat.

## 2. Service Dokploy

Projet **mobile-factory**, service **Application** `mobile-factory-server` :

- **Source** : GitHub, `SalvadorCardona/mobile-factory`, branche `main`,
  « Trigger type » *On push* (déploiement automatique) ;
- **Build** : type *Dockerfile*, Dockerfile `server/Dockerfile`, contexte `.`
  (la racine : le serveur importe `shared/`) ;
- **Volume** : *Volume mount* `mobile-factory-data` → `/data` (la base SQLite
  et ses sauvegardes : elle survit aux redéploiements) ;
- **Domaine** : `mobile-factory-api.cardona.digital`, chemin `/`, port
  conteneur `8790`, HTTPS activé, certificat *Let's Encrypt* (Traefik transmet
  les WebSockets sans réglage) ;
- **Variables d'environnement** (onglet Environment, jamais commitées) :

  ```
  CORS_ORIGINS=https://mobile-factory.cardona.digital
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
volume (*Volume Backups*) du volume `mobile-factory-data`.

## 4. Le client de production

### DNS (à la main)

Créer `A mobile-factory.cardona.digital → 148.230.109.72` (même IP que le
serveur). Sans lui, Let's Encrypt ne délivre pas le certificat.

### Service Dokploy

Projet **mobile-factory**, service **Application** `mobile-factory-client` :

- **Source** : GitHub, `SalvadorCardona/mobile-factory`, branche `main`,
  « Trigger type » *On push* ;
- **Build** : type *Dockerfile*, Dockerfile `client/Dockerfile`, contexte `.` ;
- **Build-time Arguments** (onglet Environment — pas les variables
  d'exécution : Vite fige `VITE_API_URL` dans le bundle) :

  ```
  VITE_API_URL=https://mobile-factory-api.cardona.digital
  ```

- **Domaine** : `mobile-factory.cardona.digital`, chemin `/`, port conteneur
  `80`, HTTPS activé, certificat *Let's Encrypt*.

nginx (`client/nginx.conf`) sert le jeu sous `/mobile-factory/` (la `base` de
`vite.config.ts`, comme sur GitHub Pages) et renvoie `/` vers ce chemin en
gardant la requête. Le lien d'invitation (`?join=`) et son QR code sont bâtis
sur l'adresse de la page : ils prennent donc `https://mobile-factory.cardona.digital/mobile-factory/?join=CODE`
sans réglage.

Essai local : `docker build -f client/Dockerfile --build-arg VITE_API_URL=… -t mobile-factory-client .`

### Retirer GitHub Pages

Une fois le nouveau domaine validé (section 5) : *Settings → Pages → Build and
deployment → Source* sur « None » et supprimer `.github/workflows/deploy.yml`
(la variable `VITE_API_URL` du dépôt devient inutile). Mettre à jour
l'adresse du jeu dans le README, le portfolio cardona.digital et la page
Notion du projet. Ne pas laisser les deux versions en ligne : leurs
sauvegardes locales (`localStorage`) sont par origine et divergeraient.

## 5. Vérifier

```bash
curl https://mobile-factory-api.cardona.digital/health
npx wscat -c wss://mobile-factory-api.cardona.digital/ws -H "Origin: https://mobile-factory.cardona.digital"
curl -I https://mobile-factory.cardona.digital/
```

Parcours à deux, en production : A crée un compte, lance une partie, pause →
« Inviter un ami » (URL et QR code sur le nouveau domaine) ; B, dans un autre
navigateur (idéalement un téléphone), ouvre le lien, crée un compte ou se
connecte, rejoint. Vérifier que les deux personnages se voient, que ce que bâtit
l'un apparaît chez l'autre, que la déconnexion de B ne casse pas la partie de A.
Hors ligne et sans compte, le jeu se joue comme avant.

Un redéploiement (bouton *Deploy*, ou un push sur `main`) ne doit pas perdre
les comptes : se connecter avant et après.
