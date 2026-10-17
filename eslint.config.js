import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },

  js.configs.recommended,

  // Le lint typé ne s'applique qu'aux fichiers du projet TypeScript.
  // eslint.config.js lui-même n'en fait pas partie.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),

  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  /*
   * Le garde-fou. C'est la seule règle non négociable du projet : `sim/` et
   * `data/` ne connaissent ni Pixi, ni le rendu, ni l'UI, ni le DOM. `art/`,
   * les sprites en SVG, non plus : ce sont des chaînes, lues aussi par les
   * tests en Node. Ni l'i18n : la simulation émet des identifiants, l'UI
   * les traduit.
   *
   * Sans elle, la règle s'érode en trois semaines et on perd d'un coup les
   * tests headless, la sauvegarde par sérialisation et la possibilité de
   * déplacer la simulation dans un Web Worker.
   */
  {
    files: ['src/sim/**', 'src/data/**', 'src/art/**'],
    rules: {
      /*
       * Variante typescript-eslint plutôt que la règle de base : elle voit
       * aussi les `import type`, que la règle ESLint native laisse passer.
       */
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: ['pixi.js', '**/render/*', '**/ui/*', '**/i18n/**'] },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'sim/ ne connaît pas le DOM.' },
        { name: 'document', message: 'sim/ ne connaît pas le DOM.' },
      ],
    },
  },

  // Tests et outillage tournent en Node, pas dans le navigateur.
  {
    files: ['**/*.test.ts', 'src/tools/**', 'e2e/**', 'playwright.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // Le back-end tourne dans Node.
  {
    files: ['server/**'],
    languageOptions: { globals: globals.node },
  },

  /*
   * Le contrat partagé entre le jeu et le serveur : ni DOM, ni Node, ni
   * code de l'un ou de l'autre — les deux l'importent.
   */
  {
    files: ['shared/**'],
    languageOptions: { globals: {} },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: ['node:*', 'pixi.js', '**/src/**', '**/server/**'] },
      ],
    },
  },

  {
    files: ['*.config.ts', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
);
