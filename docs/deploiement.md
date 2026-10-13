# Déployer le serveur sur Dokploy

Le serveur (`server/`, voir CLAUDE.md « Back-end ») tourne sur le Dokploy de
cardona.digital, construit depuis `server/Dockerfile`. Le jeu reste sur GitHub
Pages ; il ne parle au serveur que si `VITE_API_URL` est fixée à son build.

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
  CORS_ORIGINS=https://cardona.digital
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

Dans le dépôt GitHub, *Settings → Secrets and variables → Actions → Variables* :

```
VITE_API_URL=https://mobile-factory-api.cardona.digital
```

`deploy.yml` la passe au build de Pages. Le lien d'invitation (`?join=`) est
bâti sur l'adresse de la page, donc sur le domaine public du jeu : rien à régler.

## 5. Vérifier

```bash
curl https://mobile-factory-api.cardona.digital/health
npx wscat -c wss://mobile-factory-api.cardona.digital/ws -H "Origin: https://cardona.digital"
```

Un redéploiement (bouton *Deploy*, ou un push sur `main`) ne doit pas perdre
les comptes : se connecter avant et après.
