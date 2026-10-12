/** Les variables que Vite injecte au build (`.env*`, `VITE_*`). */
interface ImportMetaEnv {
  /** L'URL du back-end (`https://api.exemple.fr`) ; absente, le jeu reste hors ligne sans rien demander. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
