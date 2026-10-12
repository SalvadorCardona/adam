# Le back-end de Mobile Factory. À construire depuis la racine du dépôt —
# le serveur importe le contrat partagé (`shared/`) :
#
#   docker build -f server/Dockerfile -t mobile-factory-server .
#   docker run -p 8790:8790 -v mf-data:/data mobile-factory-server
#
# Node 24 exécute le TypeScript tel quel (types effacés) et embarque SQLite
# (`node:sqlite`) : pas d'étape de build, pas de module natif à compiler.

FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8790 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/mobile-factory.sqlite

WORKDIR /app

# Les dépendances d'abord, pour garder la couche en cache tant que les
# manifestes ne bougent pas. Celles du serveur seulement : ni Pixi ni Vite.
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --omit=dev --workspace=server --include-workspace-root=false && npm cache clean --force

COPY shared/ shared/
COPY server/src/ server/src/
COPY server/migrations/ server/migrations/

# La base vit dans un volume : elle survit au remplacement du conteneur.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

EXPOSE 8790

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "server/src/main.ts"]
