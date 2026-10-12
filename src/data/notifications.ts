/**
 * Les notifications du navigateur : ce qui peut en déclencher une, et combien
 * par jour au plus. Pure donnée — l'envoi est dans `ui/notifier.ts`, les
 * textes dans `notifications` de chaque dictionnaire.
 *
 * Elles ne partent que pendant que la page est ouverte mais n'a pas la main
 * (fenêtre en retrait) : la partie s'arrête onglet caché, et le jeu n'a pas
 * de serveur pour réveiller un onglet fermé.
 */

export const NOTIFICATION_KINDS = ['research', 'child', 'supplies', 'attack'] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATIONS = {
  /** Les plafonds quotidiens au choix, dans l'ordre où le réglage les fait défiler. */
  dailyLimits: [1, 3, 5, 10],
  defaultLimit: 3,
  /** Tous les types sont permis tant qu'on ne les a pas coupés. */
  defaultKinds: { research: true, child: true, supplies: true, attack: true },
} as const satisfies {
  dailyLimits: readonly number[];
  defaultLimit: number;
  defaultKinds: Record<NotificationKind, boolean>;
};
