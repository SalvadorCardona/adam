/** Section `inventory` du dictionnaire français : le panneau du sac, et la ville en tableau de bord. */

export const inventory = {
  title: 'Sac',
  /** Les onglets de la fenêtre du sac. */
  tabs: {
    inventory: 'Inventaire',
    wardrobe: 'Habillement',
  },
  town: 'Ville',
  /** « 12/20 — 8 places libres ». */
  capacity: (total: number, capacity: number, free: number): string =>
    `${total}/${capacity} — ${free} place${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}`,
  whereNear: 'Près de la mairie : ce que vous déposez rejoint le stock de la ville.',
  whereFar: 'Loin de la mairie : ce que vous jetez reste au sol, et se ramasse en repassant dessus.',
  whereNoTown: 'Pas encore de ville : ce que vous jetez reste au sol, et se ramasse en repassant dessus.',
  empty: 'Le sac est vide.',
  /** Sous la grille, tant qu'aucune case n'est choisie. */
  pick: 'Touchez une case pour choisir un objet.',
  /** L'`aria-label` d'une case : « Bois : 6 ». */
  slot: (item: string, amount: number): string => `${item} : ${amount}`,
  townEmpty: 'Rien en stock pour l’instant.',
  deposit: 'Déposer',
  drop: 'Jeter',
  depositAll: 'Déposer en ville',
  dropAll: 'Tout jeter',
  /** L'`aria-label` du bouton d'une ligne. */
  depositItem: (item: string): string => `Déposer en ville : ${item}`,
  dropItem: (item: string): string => `Jeter : ${item}`,
  /** Un débit déjà signé (« +28 », « −4 »), par minute. */
  perMinute: (rate: string): string => `${rate}/min`,
  /** Alerte de pénurie : la recette du bâtiment attend l'objet. */
  shortage: {
    forge: (item: string, stock: number): string => `${item} : la forge attend (${stock} en ville)`,
    nursery: (item: string, stock: number): string => `${item} : la nurserie attend (${stock} en ville)`,
  },
  /** Alerte de surplus, quand le stock monte : `rate` déjà signé (« +28 »). */
  surplusRate: (item: string, rate: string): string => `${item} : ${rate}/min, personne ne l’utilise`,
  /** Alerte de surplus, quand le stock ne monte plus. */
  surplusStock: (item: string, stock: number): string => `${item} : ${stock} en ville, personne ne l’utilise`,
};
