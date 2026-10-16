# Le client d'Adam : build Vite, puis nginx qui sert `dist/`.
# À construire depuis la racine du dépôt, avec l'adresse du serveur en argument :
#
#   docker build -f client/Dockerfile \
#     --build-arg VITE_API_URL=https://adam-api.cardona.digital \
#     -t adam-client .
#   docker run -p 8080:80 adam-client
#
# Sans `VITE_API_URL`, le jeu est construit hors ligne : aucune requête serveur.

FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci

COPY . .

# Une variable `VITE_*` est figée dans le bundle : elle doit exister au build.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
# Le vocal : un relais TURN, facultatif (sans lui, STUN public seul). Voir docs/deploiement.md, « Vocal ».
ARG VITE_TURN_URL=
ARG VITE_TURN_USERNAME=
ARG VITE_TURN_CREDENTIAL=
ENV VITE_TURN_URL=$VITE_TURN_URL \
    VITE_TURN_USERNAME=$VITE_TURN_USERNAME \
    VITE_TURN_CREDENTIAL=$VITE_TURN_CREDENTIAL
RUN npm run build

FROM nginx:1.27-alpine

COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY client/legacy /usr/share/nginx/legacy
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
