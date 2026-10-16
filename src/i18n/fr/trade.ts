/** Section `trade` du dictionnaire français : la fenêtre Troc de la caravane. */

/** En minuscules, au milieu d'une phrase (le test des dictionnaires y glisse des nombres). */
const lower = (text: string): string => String(text).toLowerCase();

export const trade = {
  title: 'Troc',
  settling: 'Le marchand s’installe…',
  /** Le temps avant le départ, en secondes : « Repart dans 1 min 05 s ». */
  leavesIn: (seconds: number): string => `Repart dans ${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`,
  approach: 'Approchez-vous de la charrette pour échanger.',
  paidBoth: 'Payé avec le sac, puis la ville.',
  paidBag: 'Payé avec le sac : la ville est trop loin.',
  /** Le titre d'un échange, par sorte. */
  kinds: {
    surplus: 'Surplus contre manque',
    loot: 'Butin contre métal',
    wayside: 'Offre du marchand ambulant',
  },
  /** Le titre d'une offre rare, d'après son libellé (`rareOffers`). */
  rare: (offer: string): string => `Rare : ${lower(offer)}`,
  wayside: 'Un marchand ambulant : une seule offre, rare.',
  waysideOnce: 'Un seul échange, et il repart',
  exchange: 'Échanger',
  done: 'Échangé',
  /** Places de sac gagnées. */
  bagSlots: (n: number): string => `+${n} places`,
  /** Un objet qui manque, dans la liste « Il manque … ». */
  missingItem: (amount: number, item: string): string => `${amount} ${lower(item)}`,
  /** `list` : les objets qui manquent, déjà joints par des virgules. */
  missing: (list: string): string => `Il manque ${list}`,
  rareLeft: (n: number): string => `Encore ${n} fois sur la partie`,
  oncePerCaravan: 'Une fois par caravane',
};
