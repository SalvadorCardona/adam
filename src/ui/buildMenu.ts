/**
 * Menu de construction.
 *
 * Un seul bouton à l'écran — « Bâtir » — qui ouvre un tiroir. Le tiroir
 * liste les bâtiments débloqués en cartes : vignette, nom, ce que fait le
 * bâtiment en une ligne (`effect`), coût et ouvriers en icônes — et, pour
 * une foreuse, son assise : moitié filon, moitié herbe. Choisir une carte ferme le tiroir et arme le placement
 * (`input/placement.ts`) ; une barre remplace alors le bouton, avec le nom
 * du bâtiment choisi, « Poser », « Poser encore » et « Annuler ». « Poser »
 * rend la main au joystick ; « Poser encore » garde le bâtiment armé, pour
 * enchaîner les poses sans rouvrir le tiroir.
 *
 * Une liste de boutons toujours visibles mangeait un tiers de l'écran sur
 * un téléphone ; à six bâtiments, elle aurait recouvert la carte.
 *
 * Les boutons de pose n'apparaissent qu'une fois le fantôme posé et reste grisé
 * tant que l'emplacement est refusé : le joueur voit pourquoi ça ne marche
 * pas avant d'appuyer, pas après. Le motif s'écrit en une ligne dans une
 * bulle sous le fantôme (`placementReason.ts`), qui le suit sur la carte ;
 * la barre garde le remède quand Adam peut dégager la place.
 *
 * Une carte ne se grise pas quand le sac est vide : poser un chantier ne
 * coûte rien, c'est le remplir qui coûte. Le coût se colore d'après ce qui
 * peut le payer — le sac d'Adam et le stock de la ville : vert ce qu'il y a
 * déjà, orange ce qui manque.
 *
 * Le menu ne montre que ce qui se bâtit (`World.inMenu`) : pas de carte
 * grisée, sauf pour un bâtiment que le chapitre en cours demande et que le
 * labo n'a pas encore ouvert — « À découvrir au labo », avec sa recherche
 * (`lockedObjectiveBuildings`), au bout de la liste, sans rien à toucher. Tant que la mairie est en chantier, le bouton « Bâtir »
 * lui-même reste caché : un débutant ne dépense pas son premier bois
 * ailleurs. Ensuite, un bâtiment n'y entre qu'une fois débloqué — sa
 * recherche finie au labo (forge, four, clinique), son plan donné par Ève,
 * son objectif atteint (l'antenne) — et un bâtiment unique déjà posé en sort.
 * Le reste à découvrir se lit au labo, pas ici.
 *
 * Un bâtiment qui vient d'entrer porte « Nouveau » jusqu'à ce qu'on choisisse
 * sa carte (commande `seeBuilding`) ou qu'on le pose ; le bouton « Bâtir »
 * a une pastille tant qu'il en reste un. L'annonce, elle, est un toast du HUD
 * (`buildingsUnlocked`).
 *
 * Les cartes se rangent à l'ouverture du tiroir, par utilité du moment
 * (`buildOrder.ts`) : la tour de guet en tête au crépuscule et la nuit, puis
 * ce qu'on peut payer tout de suite. L'ordre ne bouge plus tant que le tiroir
 * reste ouvert.
 *
 * Sur téléphone, les cartes se compactent en deux colonnes — vignette, nom,
 * coût et ouvriers en puces — pour tenir toutes, ou presque, sans défiler. L'effet quitte la
 * carte pour une ligne au pied du tiroir, qu'un appui long (ou le focus
 * clavier) remplit ; la ligne est toujours là, la liste ne bouge pas.
 *
 * En haut du tiroir, un champ de recherche (loupe, « × » pour le vider) prend
 * le focus à chaque ouverture, vidé : on tape tout de suite. Il filtre les
 * cartes à la frappe (`buildSearch.ts` : nom, métier, ce que le bâtiment
 * produit, sans casse ni accents), sans jamais montrer une carte verrouillée ;
 * rien ne correspond, une ligne le dit. Dans le champ, Entrée choisit la
 * première carte, Échap le vide puis ferme le tiroir, la flèche du bas
 * descend dans les cartes (et celle du haut, depuis la première ligne, y
 * remonte) ; aucune touche tapée n'atteint le reste du jeu. Sur téléphone, le
 * clavier qui monte soulève le tiroir (`visualViewport`) : la liste reste
 * au-dessus de lui ; le champ écrit en 16 px, sous quoi iOS zoomerait.
 *
 * Sous le champ de recherche, une rangée de puces filtre les cartes par famille
 * (`category` de `data/buildings.ts`) : « Tous », puis chaque famille qui a
 * au moins une carte au menu, avec leur nombre (`buildFilter.ts`). Une seule
 * active ; sur téléphone, la rangée défile de côté. La famille choisie tient
 * d'une ouverture à l'autre, pas le texte cherché, vidé à chaque
 * ouverture. Famille et texte s'appliquent ensemble ; si la famille n'a rien
 * pour le texte mais « Tous » si, une ligne le dit et y mène d'un tap.
 *
 * Au clavier (`handleKey`) : Espace ouvre le tiroir sur le champ de recherche, les flèches ou ZQSD/WASD passent d'une
 * carte à l'autre dans la grille, Entrée choisit, Espace ou Échap referment.
 * La sélection est le vrai focus du navigateur : un lecteur d'écran suit, et
 * Tab continue de marcher. Tant que le tiroir est ouvert, ces touches sont au
 * menu — `main.ts` ne les passe ni au déplacement ni à la pause. Tiroir
 * fermé, Échap annule un placement armé au lieu de mettre en pause.
 */

import { TILE_SIZE } from '../core/grid.ts';
import { gridStep, type GridMove } from '../core/gridNav.ts';
import { BUILDING_CATEGORIES, BUILDINGS, type BuildingId, type BuildingProto } from '../data/buildings.ts';
import type { CategoryFilter } from '../data/categoryIcons.ts';
import type { ItemId } from '../data/items.ts';
import type { Placement } from '../input/placement.ts';
import { footingHalf } from '../sim/footing.ts';
import { lockedObjectiveBuildings } from '../sim/objectives.ts';
import type { World } from '../sim/world.ts';
import { locale, onLocale, t } from '../i18n/locale.ts';
import { BuildFilter, type FilterCard } from './buildFilter.ts';
import { buildOrder } from './buildOrder.ts';
import { buildingTerms, searchKey } from './buildSearch.ts';
import { buildingIcon, categoryIcon, itemAmount, itemIcon, jobIcon, uiIcon } from './icons.ts';
import { footingText, placementOutput, placementReason } from './placementReason.ts';

/** Position physique → mouvement dans la grille : flèches, et ZQSD/WASD comme pour marcher. */
const MOVES: Readonly<Record<string, GridMove>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
};

/** Un doigt posé plus longtemps que ça sur une carte lit son effet au lieu de la choisir. */
const LONG_PRESS_MS = 450;

export class BuildMenu {
  public readonly root: HTMLElement;

  private readonly toggleButton: HTMLButtonElement;
  private readonly drawer: HTMLElement;
  private readonly list: HTMLElement;
  private readonly search: HTMLInputElement;
  private readonly searchClear: HTMLButtonElement;
  /** « Aucun bâtiment ne correspond » : la recherche a vidé la liste, dans toutes les familles. */
  private readonly searchEmpty: HTMLElement;
  /** Les puces de filtre, « Tous » d'abord, une par famille. */
  private readonly chips = new Map<CategoryFilter, { button: HTMLButtonElement; count: HTMLElement }>();
  /** Sous les puces : la famille n'a rien pour le texte cherché, « Tous » si. */
  private readonly notice: HTMLButtonElement;
  private readonly filter = new BuildFilter();
  private readonly effectLine: HTMLElement;
  private readonly armedBar: HTMLElement;
  private readonly armedLabel: HTMLElement;
  private readonly reasonText: HTMLElement;
  private readonly reasonRemedy: HTMLElement;
  private readonly reason: HTMLElement;
  private readonly confirmButton: HTMLButtonElement;
  private readonly repeatButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  /** Pourquoi le fantôme ne se pose pas, en une ligne, dans une bulle sous lui. */
  private readonly ghostBubble: HTMLElement;
  private project: (x: number, y: number) => { x: number; y: number } = (x, y) => ({ x, y });
  private readonly cards = new Map<BuildingId, HTMLButtonElement>();
  private readonly badges = new Map<BuildingId, HTMLElement>();
  /** Les cartes grisées « À découvrir au labo », au bout de la liste, et ce qu'elles montrent. */
  private teasers: HTMLElement[] = [];
  private teaserKey = '';
  private readonly costs: { item: ItemId; amount: number; element: HTMLElement }[] = [];
  /** Les libellés fixes des cartes, réécrits à chaque changement de langue. */
  private readonly relabels: (() => void)[] = [];
  private opened = false;
  /** Où la recherche cherche chaque carte (nom, métier, produits), relu à chaque changement de langue. */
  private readonly terms = new Map<HTMLButtonElement, readonly string[]>();
  /** L'appui long vient de montrer un effet : le `click` qui suit le relâchement ne choisit pas la carte. */
  private swallowClick = false;

  private readonly world: World;
  private readonly placement: Placement;
  private readonly onOpen: () => void;

  /** `buildings` : tous les bâtiments du menu ; chacun ne se montre qu'une fois débloqué. */
  public constructor(world: World, placement: Placement, buildings: readonly BuildingId[], onOpen: () => void = () => {}) {
    this.world = world;
    this.placement = placement;
    this.onOpen = onOpen;
    this.root = document.createElement('div');
    this.root.className = 'build-menu';

    const toggleLabel = document.createElement('span');

    toggleLabel.className = 'build-toggle-label';
    const spaceKey = keyHint();

    this.toggleButton = button('', (event) => this.toggle(!touched(event)));
    this.toggleButton.className = 'build-toggle';
    this.toggleButton.append(uiIcon('hammer', 28), toggleLabel, spaceKey);
    this.toggleButton.setAttribute('aria-keyshortcuts', 'Space');

    this.drawer = document.createElement('div');
    this.drawer.className = 'panel build-drawer';
    this.drawer.hidden = true;

    const title = document.createElement('div');

    title.className = 'build-drawer-title';

    const close = button('', () => this.close());

    close.className = 'build-drawer-close';
    close.append(uiIcon('close'));

    const keys = document.createElement('span');
    const arrowsKey = keyHint();
    const enterKey = keyHint();
    const escapeKey = keyHint();

    keys.className = 'build-drawer-keys';
    keys.append(arrowsKey, enterKey, escapeKey);

    const header = document.createElement('header');

    header.append(title, keys, close);

    // La recherche : la loupe, le champ, et « × » quand il y a du texte.
    const searchRow = document.createElement('label');

    searchRow.className = 'build-search';
    this.search = document.createElement('input');
    this.search.type = 'search';
    this.search.className = 'build-search-input';
    this.search.autocomplete = 'off';
    this.search.spellcheck = false;
    this.search.enterKeyHint = 'go';
    this.search.addEventListener('input', () => this.searchChanged());
    this.search.addEventListener('keydown', (event) => this.searchKeyDown(event));
    // « × » vide le champ et lui rend le focus : on retape aussitôt.
    this.searchClear = button('', () => {
      this.clearSearch();
      this.search.focus();
    });
    this.searchClear.className = 'build-search-clear';
    this.searchClear.append(uiIcon('close', 18));
    this.searchClear.hidden = true;
    searchRow.append(uiIcon('search', 22), this.search, this.searchClear);

    const filters = document.createElement('div');

    filters.className = 'build-filters';
    filters.setAttribute('role', 'toolbar');
    for (const filter of ['all', ...Object.keys(BUILDING_CATEGORIES)] as CategoryFilter[]) {
      const chip = button('', () => this.choose(filter));
      const label = document.createElement('span');
      const count = document.createElement('span');

      chip.className = 'build-filter';
      chip.hidden = true;
      chip.setAttribute('aria-pressed', 'false');
      count.className = 'build-filter-count';
      chip.append(categoryIcon(filter), label, count);
      this.relabels.push(() => {
        label.textContent = filter === 'all' ? t().menu.allCategories : t().buildingCategories[filter];
      });
      this.chips.set(filter, { button: chip, count });
      filters.append(chip);
    }

    this.notice = button('', () => this.choose('all'));
    this.notice.className = 'build-filter-notice';
    this.notice.hidden = true;

    this.list = document.createElement('div');
    this.list.className = 'build-drawer-list';

    for (const id of buildings) {
      const card = this.card(id);

      this.cards.set(id, card);
      this.list.append(card);
    }

    this.searchEmpty = document.createElement('div');
    this.searchEmpty.className = 'build-search-empty';
    this.searchEmpty.setAttribute('role', 'status');
    this.searchEmpty.hidden = true;

    // Masquée sur grand écran, où chaque carte porte son effet.
    this.effectLine = document.createElement('div');
    this.effectLine.className = 'build-drawer-effect';
    this.effectLine.setAttribute('role', 'status');

    this.drawer.append(header, searchRow, filters, this.notice, this.list, this.searchEmpty, this.effectLine);

    this.armedBar = document.createElement('div');
    this.armedBar.className = 'panel build-armed';
    this.armedBar.hidden = true;

    this.armedLabel = document.createElement('span');
    this.armedLabel.className = 'build-armed-label';

    // Pourquoi « Poser » est grisé : une ligne, lue à voix haute par un lecteur d'écran.
    this.reason = document.createElement('span');
    this.reason.className = 'build-armed-reason';
    this.reason.setAttribute('role', 'status');
    this.reason.hidden = true;
    this.reasonText = document.createElement('strong');
    this.reasonRemedy = document.createElement('span');
    this.reason.append(this.reasonText, this.reasonRemedy);

    this.confirmButton = button('', () => this.placement.confirm());
    this.confirmButton.dataset['confirm'] = 'true';
    this.repeatButton = button('', () => this.placement.confirm(true));
    this.cancelButton = button('', () => this.placement.cancel());
    this.armedBar.append(
      this.armedLabel,
      this.reason,
      this.cancelButton,
      this.repeatButton,
      this.confirmButton,
    );

    this.ghostBubble = document.createElement('div');
    this.ghostBubble.className = 'build-ghost-bubble';
    this.ghostBubble.setAttribute('role', 'status');
    this.ghostBubble.hidden = true;

    this.root.append(this.ghostBubble, this.drawer, this.armedBar, this.toggleButton);

    // Le menu vit toute la partie : ses libellés fixes suivent la langue.
    // Ceux qui changent avec l'état (barre de pose, verrous) se relisent à chaque `refresh()`.
    onLocale(() => {
      const text = t();

      toggleLabel.textContent = text.menu.build;
      spaceKey.textContent = text.menu.keys.space;
      title.textContent = text.menu.drawerTitle;
      this.search.placeholder = text.menu.searchPlaceholder;
      this.search.setAttribute('aria-label', text.menu.searchPlaceholder);
      this.searchClear.setAttribute('aria-label', text.menu.searchClear);
      this.searchEmpty.textContent = text.menu.searchEmpty;
      close.setAttribute('aria-label', text.common.close);
      arrowsKey.textContent = text.menu.keys.arrows;
      enterKey.textContent = text.menu.keys.enter;
      escapeKey.textContent = text.menu.keys.escape;
      this.effectLine.textContent = text.menu.effectPrompt;
      this.repeatButton.textContent = text.menu.placeAgain;
      this.cancelButton.textContent = text.common.cancel;
      for (const relabel of this.relabels) relabel();
      // Les noms ont changé de langue : la recherche se relit dans la nouvelle.
      for (const [id, card] of this.cards) this.terms.set(card, buildingTerms(id, text));
      this.searchChanged();
      // Les icônes des coûts portent le nom de l'objet (`itemIcon`), posé à leur création.
      for (const { item, element } of this.costs) {
        const image = element.querySelector('img');

        if (image) {
          image.alt = text.items[item];
          image.title = text.items[item];
        }
      }
      this.refresh();
    });
  }

  /** Une carte : vignette, nom et badge « Nouveau », effet, coût et ouvriers en puces, emprise. */
  private card(id: BuildingId): HTMLButtonElement {
    const proto: BuildingProto = BUILDINGS[id];
    const card = button('', () => {
      if (this.swallowClick) {
        this.swallowClick = false;
        return;
      }
      if (!this.shown(id)) return;
      if (this.world.isNewInMenu(id)) this.world.push({ type: 'seeBuilding', building: id });
      this.close();
      this.placement.select(id);
    });

    card.className = 'build-card';
    this.longPress(card, () => this.showEffect(id));
    card.addEventListener('focus', () => this.showEffect(id));
    // La vignette du bâtiment, et le médaillon de son métier épinglé à son coin.
    const thumb = document.createElement('span');
    const icon = buildingIcon(id);

    thumb.className = 'build-card-thumb';
    thumb.append(icon, jobIcon(id));
    card.append(thumb);

    const body = document.createElement('div');

    body.className = 'build-card-body';

    const name = document.createElement('div');

    name.className = 'build-card-name';
    body.append(name);

    const badge = document.createElement('span');

    badge.className = 'build-card-new';
    badge.textContent = t().menu.newBadge;
    badge.hidden = true;
    this.badges.set(id, badge);
    name.append(badge);

    const effect = document.createElement('div');

    effect.className = 'build-card-effect';
    body.append(effect);

    // Une foreuse rappelle son assise : la moitié sur un filon, l'autre sur l'herbe, en icônes.
    const footing = proto.deposits ? footingRow(proto) : null;

    if (footing) body.append(footing.row);

    const cost = document.createElement('div');

    cost.className = 'build-card-cost';

    const entries = Object.entries(proto.cost) as [ItemId, number][];

    // Sans coût, un mot à la place des icônes (un nœud texte : la puce des ouvriers le suit).
    const free = entries.length === 0 ? document.createTextNode('') : null;

    if (free) cost.append(free);
    for (const [item, amount] of entries) {
      const element = itemAmount(item, amount);

      this.costs.push({ item, amount, element });
      cost.append(element);
    }

    // Les ouvriers en puce à la suite du coût : elle reste sur la carte compacte du téléphone.
    let workers: HTMLElement | null = null;

    if (proto.workers > 0) {
      workers = document.createElement('span');
      workers.className = 'build-card-workers';
      workers.setAttribute('role', 'img');
      workers.append(uiIcon('worker', 18), String(proto.workers));
      cost.append(workers);
    }

    this.relabels.push(() => {
      const text = t();

      icon.alt = text.buildings[id].label;
      name.textContent = text.buildings[id].label;
      effect.textContent = text.buildings[id].effect;
      footing?.relabel();
      if (free) free.data = text.menu.free;
      if (workers) {
        const label = text.menu.employs(proto.workers);

        workers.setAttribute('aria-label', label);
        workers.title = label;
      }
    });

    const meta = document.createElement('div');

    meta.className = 'build-card-meta';
    meta.textContent = `${proto.width}×${proto.height}`;

    // Coût et emprise sur une ligne : la carte garde la hauteur d'un pouce, effet compris.
    const footer = document.createElement('div');

    footer.className = 'build-card-footer';
    footer.append(cost, meta);
    body.append(footer);

    card.append(body);
    return card;
  }

  /** Appui long : l'effet s'écrit au pied du tiroir, la carte n'est pas choisie. */
  private longPress(card: HTMLButtonElement, show: () => void): void {
    let timer: number | undefined;
    const cancel = (): void => {
      window.clearTimeout(timer);
      timer = undefined;
    };

    card.addEventListener('pointerdown', () => {
      cancel();
      this.swallowClick = false;
      timer = window.setTimeout(() => {
        timer = undefined;
        this.swallowClick = true;
        show();
      }, LONG_PRESS_MS);
    });
    card.addEventListener('pointerup', cancel);
    card.addEventListener('pointercancel', cancel);
    card.addEventListener('pointerleave', cancel);
    // Le menu contextuel du navigateur, qu'un appui long ouvre sur Android, cacherait la carte.
    card.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private showEffect(id: BuildingId): void {
    const { label, effect } = t().buildings[id];
    const proto: BuildingProto = BUILDINGS[id];
    // Sur un téléphone, la ligne d'effet est la seule à dire l'assise en toutes lettres.
    const rule = proto.deposits ? ` ${footingText(null)}` : '';

    setText(this.effectLine, t().menu.cardEffect(label, effect + rule));
  }

  /** Range les cartes par utilité du moment. Seulement à l'ouverture : rien ne saute sous le doigt. */
  private sortCards(): void {
    const phase = this.world.clock()?.phase;
    const order = buildOrder([...this.cards.keys()], {
      threat: phase === 'dusk' || phase === 'night',
      locked: (id) => !this.shown(id),
      affordable: (id) => this.affordable(id),
    });

    for (const id of order) {
      const card = this.cards.get(id);

      if (card) this.list.append(card);
    }
    this.list.append(...this.teasers);
    this.list.scrollTop = 0;
  }

  /** Toucher une puce : la liste repart d'en haut, sur cette seule famille. */
  private choose(filter: CategoryFilter): void {
    this.filter.choose(filter);
    this.refresh();
    this.list.scrollTop = 0;
    this.revealChip();
  }

  /** Sur téléphone, la rangée défile : la puce active reste en vue. */
  private revealChip(): void {
    const chip = [...this.chips.values()].find(({ button }) => button.getAttribute('aria-pressed') === 'true');

    chip?.button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** Ce que le filtre sait de chaque carte : sa famille, où chercher le texte, et si elle est au menu. */
  private filterCards(): Map<HTMLButtonElement, FilterCard> {
    const cards = new Map<HTMLButtonElement, FilterCard>();

    for (const [id, card] of this.cards) {
      cards.set(card, { category: BUILDINGS[id].category, terms: this.terms.get(card) ?? [], shown: this.shown(id) });
    }
    return cards;
  }

  /** Puces, ligne d'avis et cartes d'après le filtre. */
  private refreshFilter(): void {
    const view = this.filter.view(this.filterCards());
    const listed = new Map(view.chips.map((chip) => [chip.filter, chip.count]));

    for (const [filter, { button: chip, count }] of this.chips) {
      const n = listed.get(filter);
      const pressed = String(filter === view.active);

      if (chip.hidden === (n !== undefined)) chip.hidden = n === undefined;
      if (n === undefined) continue;
      if (chip.getAttribute('aria-pressed') !== pressed) chip.setAttribute('aria-pressed', pressed);
      setText(count, String(n));

      const name = filter === 'all' ? t().menu.allCategories : t().buildingCategories[filter];
      const label = t().menu.categoryCount(name, n);

      if (chip.getAttribute('aria-label') !== label) chip.setAttribute('aria-label', label);
    }

    for (const card of this.cards.values()) {
      const shown = view.visible.has(card);

      if (card.hidden === shown) card.hidden = !shown;
    }

    // Rien dans la famille, quelque chose dans « Tous » : la ligne y mène. Rien nulle part : « aucun ».
    const searching = this.opened && this.filter.query.trim() !== '' && view.visible.size === 0;
    const elsewhere = searching && view.elsewhere !== null;
    const empty = searching && view.elsewhere === null;

    if (this.notice.hidden === elsewhere) this.notice.hidden = !elsewhere;
    if (view.elsewhere) setText(this.notice, t().menu.resultsElsewhere(view.elsewhere.count, t().menu.allCategories));
    if (this.searchEmpty.hidden === empty) this.searchEmpty.hidden = !empty;
  }

  /** Le sac et la ville couvrent tout le coût : le chantier se remplira d'un « Transférer ». */
  private affordable(id: BuildingId): boolean {
    const { inventory } = this.world.player;
    const town = this.world.townStock();

    return (Object.entries(BUILDINGS[id].cost) as [ItemId, number][]).every(
      ([item, amount]) => inventory.count(item) + (town?.available(item) ?? 0) >= amount,
    );
  }

  public get isOpen(): boolean {
    return this.opened;
  }

  public toggle(focusSearch = true): void {
    if (this.opened) this.close();
    else this.open(focusSearch);
  }

  /**
   * Le tiroir s'ouvre sur un champ de recherche vide, sous le focus : on tape tout de suite.
   * Au toucher (`focusSearch` faux), pas de focus : il ferait monter le clavier du téléphone
   * sur la moitié de l'écran, alors qu'on vient toucher une carte.
   */
  public open(focusSearch = true): void {
    this.opened = true;
    this.filter.open();
    this.clearSearch();
    this.sortCards();
    setText(this.effectLine, t().menu.effectPrompt);
    this.drawer.hidden = false;
    this.followKeyboard(true);
    this.onOpen();
    this.refresh();
    this.revealChip();
    // Sans défilement : le clavier du téléphone soulève le tiroir (`followKeyboard`), la page ne bouge pas.
    if (focusSearch) this.search.focus({ preventScroll: true });
  }

  public close(): void {
    this.opened = false;
    this.followKeyboard(false);
    // Une carte cachée qui garde le focus avalerait les touches suivantes :
    // on le rend à la page, et les flèches refont marcher Adam.
    if (document.activeElement instanceof HTMLElement && this.drawer.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    this.drawer.hidden = true;
    this.refresh();
  }

  /**
   * Une touche pour le menu. Renvoie `true` si le menu la prend : l'appelant
   * empêche alors le navigateur et le reste du jeu de la voir.
   *
   * `canOpen` : la partie est lancée, pas en pause ni perdue. Le tiroir ne
   * s'ouvre pas non plus pendant un placement : Espace n'y a rien à faire.
   */
  public handleKey(code: string, repeat: boolean, canOpen: boolean): boolean {
    if (!this.opened) {
      // Échap annule un placement en cours avant de mettre en pause.
      if (code === 'Escape' && this.placement.mode !== 'idle') {
        if (!repeat) this.placement.cancel();
        return true;
      }
      if (code !== 'Space' || !canOpen || this.placement.mode !== 'idle' || !this.unlocked()) return false;
      if (!repeat) this.open();
      return true;
    }

    const move = MOVES[code];

    if (move) {
      const cards = this.visibleCards();
      const index = cards.indexOf(document.activeElement as HTMLButtonElement);
      const next = gridStep(index, cards.length, this.columns(cards), move);

      // Monter depuis la première ligne ramène au champ de recherche.
      if (move === 'up' && index >= 0 && next === index && index < this.columns(cards)) this.search.focus();
      else this.focus(cards[next]);
      return true;
    }

    if (code === 'Enter' || code === 'NumpadEnter') {
      if (!repeat) {
        const focused = document.activeElement;
        const card = this.visibleCards().find((c) => c === focused) ?? this.firstCard();

        card?.click();
      }
      return true;
    }

    if (code === 'Space' || code === 'Escape') {
      if (!repeat) this.close();
      return true;
    }

    return false;
  }

  /**
   * Une touche dans le champ. Elle ne va pas plus loin que lui : ni la pause
   * (P), ni le sac (I), ni Échap de `main.ts`, ni la marche d'Adam ne la voient.
   */
  private searchKeyDown(event: KeyboardEvent): void {
    event.stopPropagation();

    const action = searchKey(event.code, this.search.value);

    if (!action) return;
    event.preventDefault();
    if (event.repeat) return;
    if (action === 'pick') this.firstCard()?.click();
    else if (action === 'clear') this.clearSearch();
    else if (action === 'close') this.close();
    else this.focus(this.firstCard());
  }

  private clearSearch(): void {
    this.search.value = '';
    this.searchChanged();
  }

  /** Relit le champ : le texte du filtre, le « × », puis cartes et lignes d'avis (`refreshFilter`). */
  private searchChanged(): void {
    const query = this.search.value;

    this.searchClear.hidden = query === '';
    this.filter.search(query);
    this.refresh();
    this.list.scrollTop = 0;
  }

  /**
   * Le clavier d'un téléphone recouvre le bas de l'écran sans rétrécir la
   * page (iOS, et Android par défaut) : on lit ce qu'il cache dans
   * `visualViewport` et le tiroir monte d'autant (`--keyboard-inset`).
   */
  private followKeyboard(on: boolean): void {
    const viewport = window.visualViewport;

    if (!viewport) return;
    if (on) {
      viewport.addEventListener('resize', this.keyboardInset);
      viewport.addEventListener('scroll', this.keyboardInset);
      this.keyboardInset();
    } else {
      viewport.removeEventListener('resize', this.keyboardInset);
      viewport.removeEventListener('scroll', this.keyboardInset);
      this.root.style.removeProperty('--keyboard-inset');
    }
  }

  private readonly keyboardInset = (): void => {
    const viewport = window.visualViewport;
    const hidden = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;

    this.root.style.setProperty('--keyboard-inset', `${Math.round(hidden)}px`);
  };

  private firstCard(): HTMLButtonElement | undefined {
    return this.visibleCards()[0];
  }

  /** Dans l'ordre de la liste : la route en dernier. */
  private visibleCards(): HTMLButtonElement[] {
    return [...this.list.children].filter(
      (card): card is HTMLButtonElement => card instanceof HTMLButtonElement && !card.hidden,
    );
  }

  private focus(card: HTMLButtonElement | undefined): void {
    if (!card) return;
    card.focus();
    card.scrollIntoView({ block: 'nearest' });
  }

  /** Colonnes de la grille, lues sur la mise en page : autant de cartes que sur la première ligne. */
  private columns(cards: readonly HTMLButtonElement[]): number {
    const top = cards[0]?.offsetTop;

    return Math.max(1, cards.filter((card) => card.offsetTop === top).length);
  }

  /** Le menu s'ouvre une fois la mairie debout : avant, tout le bois lui revient. */
  private unlocked(): boolean {
    return this.world.entities.get(this.world.townHallId)?.kind === 'townHall';
  }

  /** La carte est-elle au menu ? Débloquée, et pas un bâtiment unique déjà posé. */
  private shown(id: BuildingId): boolean {
    return this.world.inMenu(id) && !this.world.atLimit(id);
  }

  /**
   * Les bâtiments que le chapitre demande et que le labo n'a pas encore
   * ouverts : une carte grisée chacun, avec sa recherche. Les autres restent
   * cachés. Aucune pendant une recherche de texte : elle ne cherche que ce qui se bâtit.
   */
  private refreshTeasers(): void {
    const locks = this.unlocked() && this.search.value.trim() === '' ? lockedObjectiveBuildings(this.world) : [];
    const key = `${locale()}:${locks.map(({ building, research }) => `${building}/${research}`).join()}`;

    if (key === this.teaserKey) return;
    this.teaserKey = key;
    for (const teaser of this.teasers) teaser.remove();

    const text = t();

    this.teasers = locks.map(({ building, research }) => {
      const card = document.createElement('div');
      const thumb = document.createElement('span');
      const body = document.createElement('div');
      const name = document.createElement('div');
      const effect = document.createElement('div');

      card.className = 'build-card build-teaser';
      thumb.className = 'build-card-thumb';
      thumb.append(buildingIcon(building), uiIcon('lock', 18));
      body.className = 'build-card-body';
      name.className = 'build-card-name';
      name.textContent = text.buildings[building].label;
      effect.className = 'build-card-effect';
      effect.textContent = `${text.menu.discover} — ${text.menu.discoverResearch(text.research[research].label)}`;
      body.append(name, effect);
      card.append(thumb, body);
      return card;
    });
    this.list.append(...this.teasers);
  }

  /** Recalcule l'état visible. Appelé à chaque changement de placement et à chaque frame. */
  public refresh(): void {
    const armed = this.placement.armedBuilding();

    let fresh = false;

    for (const [id, card] of this.cards) {
      // La pastille du bouton « Bâtir » ne dépend ni de la recherche ni de la famille.
      const isNew = this.shown(id) && this.world.isNewInMenu(id);
      const badge = this.badges.get(id);

      card.dataset['active'] = String(armed === id);
      if (badge && badge.hidden === isNew) badge.hidden = !isNew;
      fresh ||= isNew;
    }

    this.refreshFilter();
    this.refreshTeasers();
    this.toggleButton.dataset['new'] = String(fresh);

    // Le sac et la ville ne comptent que tiroir ouvert : fermé, personne ne voit les coûts.
    if (this.opened) {
      const { inventory } = this.world.player;
      const town = this.world.townStock();

      for (const { item, amount, element } of this.costs) {
        const done = String(inventory.count(item) + (town?.available(item) ?? 0) >= amount);

        if (element.dataset['done'] !== done) element.dataset['done'] = done;
      }
    }

    const idle = this.placement.mode === 'idle';
    const placing = this.placement.mode === 'placing';

    this.toggleButton.hidden = !idle || this.opened || !this.unlocked();
    // Tiroir ou barre de pose ouverts : ils occupent le bas de l'écran, où les boutons du joueur s'effacent.
    this.root.dataset['busy'] = String(!idle || this.opened);
    this.armedBar.hidden = idle;
    this.armedBar.dataset['placing'] = String(placing);

    if (armed) {
      const name = t().buildings[armed].label;
      const label = placing ? t().menu.placing(name) : t().menu.tapToPlace(name);

      if (this.armedLabel.textContent !== label) this.armedLabel.textContent = label;
    }
    setText(this.confirmButton, t().menu.place);

    const block = this.placement.block();
    const confirmable = this.placement.isConfirmable();
    const ghost = this.placement.ghost;
    // Posable : une foreuse dit ce qu'elle extraira, en vert à la place du motif.
    const output = confirmable && ghost ? placementOutput(ghost.building, ghost.tx, ghost.ty, this.world) : null;
    const reason = block ? placementReason(block, this.world) : output ? { text: output, remedy: null } : null;

    // Refusé, le motif va dans la bulle sous le fantôme ; la barre ne garde que le remède.
    const bubble = block && ghost && reason ? reason.text : null;
    // Posable mais hors du rayon de la mairie : un avertissement dans la même bulle, pas un refus.
    const far = !block && ghost && this.world.outsideTownRange(ghost.building, ghost.tx, ghost.ty);
    const warning = far ? t().panel.placement.outOfRange : null;

    this.ghostBubble.dataset['warn'] = String(bubble === null && warning !== null);
    this.placeBubble(bubble ?? warning, ghost);
    this.reason.hidden = !reason || (bubble !== null && !reason.remedy);
    this.reason.dataset['ok'] = String(!block);
    if (reason) {
      setText(this.reasonText, bubble === null ? reason.text : '');
      this.reasonText.hidden = bubble !== null;
      setText(this.reasonRemedy, reason.remedy ?? '');
      this.reasonRemedy.hidden = !reason.remedy;
    }

    this.confirmButton.hidden = !placing;
    this.confirmButton.disabled = !confirmable;
    this.repeatButton.hidden = !placing;
    this.repeatButton.disabled = !confirmable;
  }

  /** Ce que le menu pose en bas de l'écran — tiroir, barre de pose — : le joystick et la caméra s'en écartent. */
  public get bottomParts(): HTMLElement[] {
    return [this.drawer, this.armedBar];
  }

  /** Le bouton « Bâtir » : `main.ts` le range avec les autres boutons du joueur, en bas à droite. */
  public get buildButton(): HTMLButtonElement {
    return this.toggleButton;
  }

  /** `main.ts` y branche le renderer : la bulle se pose sous le fantôme, à l'écran. */
  public setProjector(project: (x: number, y: number) => { x: number; y: number }): void {
    this.project = project;
  }

  /** La bulle du motif, centrée sous l'emprise du fantôme ; cachée sans motif. */
  private placeBubble(text: string | null, ghost: { building: BuildingId; tx: number; ty: number } | null): void {
    if (text === null || !ghost) {
      if (!this.ghostBubble.hidden) this.ghostBubble.hidden = true;
      return;
    }

    const proto = BUILDINGS[ghost.building];
    const point = this.project((ghost.tx + proto.width / 2) * TILE_SIZE, (ghost.ty + proto.height) * TILE_SIZE);

    setText(this.ghostBubble, text);
    this.ghostBubble.hidden = false;
    this.ghostBubble.style.transform = `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px) translate(-50%, 10px)`;
  }

  public destroy(): void {
    this.root.remove();
  }
}

/** Ne touche au DOM que si le texte change : `refresh()` tourne à chaque frame. */
function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

/** Le nom d'une touche, en petite capsule (écrit par `onLocale`). Masqué en CSS sur les écrans sans clavier. */
function keyHint(): HTMLElement {
  const key = document.createElement('kbd');

  key.className = 'key-hint';
  return key;
}

/** Le geste vient d'un doigt ou d'un stylet (`pointerType` du clic) : ni souris, ni clavier, ni manette. */
function touched(event: MouseEvent): boolean {
  return event instanceof PointerEvent && (event.pointerType === 'touch' || event.pointerType === 'pen');
}

function button(label: string, onTap: (event: MouseEvent) => void): HTMLButtonElement {
  const element = document.createElement('button');

  element.type = 'button';
  element.textContent = label;
  // `click` et non `pointerdown` : un glissement parti d'un bouton ne doit pas
  // déclencher l'action, et `click` gère déjà l'annulation au relâchement hors
  // de la cible.
  element.addEventListener('click', onTap);
  return element;
}

/**
 * L'assise d'une foreuse sur sa carte : « 2 » et les icônes des filons
 * qu'elle accepte, « + 2 » et l'herbe. `relabel` réécrit son libellé
 * accessible à chaque changement de langue.
 */
function footingRow(proto: BuildingProto): { row: HTMLElement; relabel: () => void } {
  const deposits = proto.deposits ?? [];
  const half = footingHalf(proto.width, proto.height);
  const grass = proto.width * proto.height - half;
  const row = document.createElement('div');
  const ores = document.createElement('span');
  const grassIcon = uiIcon('grass', 18);

  row.className = 'build-card-footing';
  row.setAttribute('role', 'img');
  ores.className = 'build-card-footing-ores';
  for (const item of deposits) {
    const icon = itemIcon(item, 18);

    icon.setAttribute('aria-hidden', 'true');
    ores.append(icon);
  }
  row.append(String(half), ores, `+ ${grass}`, grassIcon);

  return {
    row,
    relabel: () => {
      const veins: Partial<Record<ItemId, string>> = t().panel.placement.veins;
      const label = t().menu.footing(
        half,
        deposits.map((item) => veins[item] ?? t().items[item]),
        grass,
      );

      row.setAttribute('aria-label', label);
      row.title = label;
    },
  };
}
