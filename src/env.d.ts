/** Les variables que Vite injecte au build (`.env*`, `VITE_*`). */
interface ImportMetaEnv {
  /** L'URL du back-end (`https://api.exemple.fr`) ; absente, le jeu reste hors ligne sans rien demander. */
  readonly VITE_API_URL?: string;
  /**
   * Le relais TURN du vocal (`turn:turn.exemple.fr:3478`), facultatif : sans lui, seul le STUN public est
   * utilisé, ce qui suffit à la plupart des réseaux. Avec lui, `VITE_TURN_USERNAME` et `VITE_TURN_CREDENTIAL`.
   */
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
