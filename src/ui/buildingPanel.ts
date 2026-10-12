/**
 * Fenêtre d'un bâtiment.
 *
 * Elle s'ouvre au tap sur un chantier ou un bâtiment et dit ce qu'il est, ce
 * qu'il contient, et ce qu'il est en train de faire : l'avancement d'un
 * chantier, le compte à rebours de la nurserie, la veille d'une tour, les
 * points de vie de la mairie et sa population, les ouvriers, les places de
 * la clinique.
 *
 * Sur un chantier, un bouton : « Transférer » vide dans le chantier tout ce
 * qu'il attend et qu'Adam porte, puis le complète avec le stock de la ville —
 * le dernier objet livré achève le chantier, la fenêtre montre alors le
 * bâtiment. La ville ne sert que les chantiers dans le rayon de la mairie
 * (`logisticRadius`) : ailleurs, on livre à la main ou par les porteurs. Un
 * bâtiment qui a un coffre — la mairie, dont le coffre est le stock de la
 * ville, une foreuse, une ferme, une forge, une nurserie… — montre la zone
 * d'échange (`transferPanel.ts`) : son coffre et le sac en deux bandes, un
 * tap fait passer un objet de l'autre côté, « Tout prendre » et « Tout
 * déposer » le reste. Sur une nurserie ou une forge, « Transférer » y verse
 * ce que sa recette consomme, le sac puis la ville. Sur un bâtiment abîmé,
 * « Réparer » y pose le bois qu'il faut (`REPAIR`), le sac puis la ville, et
 * une ligne dit qu'on peut aussi le heurter. La fenêtre ne modifie rien
 * elle-même : chaque bouton pousse une commande (`transferToSite`,
 * `transferItems`, `supplyBuilding`, `repairBuilding`)
 * que le tick consomme.
 *
 * Sur le labo de recherche, la fenêtre devient le panneau Recherche
 * (`researchPanel.ts`) : la recherche en cours et la liste des recherches.
 *
 * Un bâtiment qui a des niveaux (`BUILDINGS[proto].upgrades`) montre en plus
 * le suivant : ce qu'il apporte, son coût — ce qui manque en rouge — et son
 * bouton (« Renforcer » pour la tour de guet), qui pousse `upgradeBuilding`.
 * Au dernier niveau, le bouton reste, grisé : « Niveau max ».
 *
 * Un producteur (foreuse, ferme, forge, nurserie, cabane de bûcheron) a un
 * bouton « Pause » / « Reprendre » (`pauseBuilding`). Un bâtiment qui emploie
 * a un sélecteur − / nombre / + (`setWorkers`) : un pictogramme d'ouvrier par
 * poste, plein s'il est occupé, vide sinon, marqué s'il est demandé mais
 * qu'aucun ouvrier libre ne vient le prendre.
 * Sous lui, la priorité de travail en trois boutons segmentés — Basse,
 * Moyenne, Haute (`setPriority`) : quand les ouvriers manquent, Haute se
 * pourvoit d’abord.
 *
 * La forge (`GEAR_WORKSHOP`) forge aussi l'arc d'Adam : l'arc suivant, son
 * coût — ce qui manque en rouge — et « Forger l'arc » (`craftGear`).
 *
 * Une base mutante se tape aussi (`showBase`) : la même fenêtre, sans bouton,
 * dit son niveau, sa zone, ses points de vie et l'équipement qu'il faut pour
 * l'entamer. Elle se ferme quand la base tombe. Hors de vue, elle dit ce
 * qu'on en a vu la dernière fois (`World.knownEnemyBase`).
 *
 * Sur un téléphone, elle doit laisser voir le jeu autour : ce qui se compte
 * se dit en puces « pictogramme + nombre » (habitants, nuits, rayon,
 * coffre…) plutôt qu'en phrases. Chaque puce porte son libellé
 * (`aria-label`), qu'un tap affiche dans une bulle ; la phrase d'ambiance
 * se déplie sous le bouton (i). Les points de vie tiennent sur une ligne :
 * cœur, barre, nombre. Le coffre — le stock de la ville pour la mairie —
 * coiffe ses objets d'un pictogramme de coffre.
 *
 * Sous le titre, deux onglets (`panelTabs.ts`) : « Bâtiment » — vie, ce
 * qu'il fait, ouvriers, boutons — et « Inventaire », la zone d'échange. Un
 * bâtiment sans coffre où échanger n'a que le premier, et pas de rangée
 * d'onglets. L'onglet choisi tient tant que la fenêtre reste ouverte ; elle
 * se rouvre toujours sur « Bâtiment ».
 *
 * La même fenêtre s'ouvre au tap sur une créature — un habitant ou un
 * ennemi (`showCreature`) : son portrait et son nom en tête, ses points de
 * vie pour un ennemi, son âge en puce, puis ce que le jeu sait d'elle —
 * métier ou espèce, ce qu'elle fait, où elle loge, ce qu'elle porte
 * (`creatureView.ts`). Rien d'autre : ni coffre, ni bouton.
 *
 * Elle **lit** le monde à chaque frame tant qu'elle est ouverte, et se ferme
 * seule si l'entité disparaît — rasée par un mutant, ennemi abattu.
 */

import { BUILDINGS, REPAIR, bedsOf, buildingLevel, maxLevel, nextUpgrade, type BuildingId, type BuildingLevel } from '../data/buildings.ts';
import { CLINIC } from '../data/clinic.ts';
import { enemyBaseLevel } from '../data/enemyBases.ts';
import { GEAR_WORKSHOP, gearOf } from '../data/gear.ts';
import { NURSERY_CARE } from '../data/inhabitants.ts';
import type { ItemId } from '../data/items.ts';
import { RECIPES, type RecipeProto } from '../data/recipes.ts';
import { WEAPONS } from '../data/weapons.ts';
import { BUILDERS, FARMERS, FORESTERS, LOGISTICIANS, LUMBERJACKS, WORK_PRIORITIES, type WorkPriority } from '../data/workers.ts';
import { floorCost } from '../sim/antenna.ts';
import { NAME_MAX } from '../sim/inhabitants.ts';
import { consumerTarget, forgeRecipe } from '../sim/consumers.ts';
import { canDamage, isShielded, isStanding, raidCapacity } from '../sim/enemyBases.ts';
import { KILL_PRESTIGE } from '../data/prestige.ts';
import { countField, type FieldCount } from '../sim/farmer.ts';
import { countPlot, type PlotCount } from '../sim/forester.ts';
import { canPause } from '../sim/staffing.ts';
import type { Building, EnemyBase, Entity, EntityId, Farmer, Forester, Forge, MobileId, Nursery } from '../sim/types.ts';
import { TICKS_PER_SECOND, repairCost, siteMissing, timerText, type SiteCoverage, type World } from '../sim/world.ts';
import type { UiIcon } from '../art/ui.ts';
import { onLocale, t } from '../i18n/locale.ts';
import { SEX_SYMBOLS, creatureView, isCreature, type CreatureView, type Selection } from './creatureView.ts';
import { buildingIcon, buildingIconUrl, creatureIconUrl, enemyBaseIconUrl, itemAmount, itemIcon, jobIcon, jobIconUrl, uiIcon } from './icons.ts';
import { moodMeter } from './moodMeter.ts';
import { needMeter } from './needMeter.ts';
import { PanelTabs } from './panelTabs.ts';
import { siteNeedRow } from './siteNeedRow.ts';
import { BarracksPanel } from './barracksPanel.ts';
import { ResearchPanel } from './researchPanel.ts';
import { TransferPanel } from './transferPanel.ts';

/** Combien de temps la bulle d'une puce reste affichée. */
const TIP_MS = 2200;

/** Les onglets de la fenêtre d'un bâtiment. */
type BuildingTab = 'building' | 'inventory';

/** Une puce : un pictogramme — ou l'icône d'un objet —, un nombre, et ce qu'il compte. */
interface Stat {
  icon: UiIcon;
  item?: ItemId;
  value: string;
  label: string;
}

export class BuildingPanel {
  public readonly root: HTMLElement;

  private readonly title: HTMLElement;
  /** « Bâtiment » et « Inventaire », sous le titre. */
  private readonly tabs: PanelTabs<BuildingTab>;
  private readonly thumb: HTMLImageElement;
  /** Le médaillon du métier, juste avant le nom ; caché pour une base ou une créature. */
  private readonly job: HTMLImageElement;
  private readonly infoButton: HTMLButtonElement;
  private readonly description: HTMLElement;
  private readonly lines: HTMLElement;
  /** La fiche d'une créature : un tableau, un libellé et une valeur par ligne. */
  private readonly facts: HTMLTableElement;
  private lastFacts = '';
  /** Le champ qui renomme un habitant, et le dernier habitant dont il a pris le nom. */
  private readonly renameForm: HTMLFormElement;
  private readonly renameInput: HTMLInputElement;
  private readonly renameButton: HTMLButtonElement;
  private renamed: MobileId | null = null;
  /** Les jauges d'un habitant : la faim, la soif. */
  private readonly needs: HTMLElement;
  private lastNeeds = '';
  /** Cœur (ou rien pour un chantier), barre, nombre : une seule ligne. */
  private readonly meter: HTMLElement;
  private readonly meterIcon: HTMLElement;
  private readonly meterValue: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly barFill: HTMLElement;
  private readonly stats: HTMLElement;
  /** La bulle qui dit ce que compte une puce. */
  private readonly tip: HTMLElement;
  private tipTimer: number | undefined;
  /** Le pictogramme du coffre, au-dessus de ce qu'il contient. */
  private readonly stock: HTMLElement;
  private readonly stockCount: HTMLElement;
  private readonly items: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly transferButton: HTMLButtonElement;
  /** La zone d'échange sac ⇄ coffre, pour les bâtiments qui ont un coffre. */
  private readonly exchange: TransferPanel;
  private readonly repairButton: HTMLButtonElement;
  private readonly pauseButton: HTMLButtonElement;
  /** « Annuler le chantier » : un premier tap arme, le second annule. */
  private readonly cancelButton: HTMLButtonElement;
  private cancelArmed = false;
  /** Le sélecteur d'ouvriers : −, les postes, +, et ce qui manque. */
  private readonly crew: HTMLElement;
  private readonly crewLess: HTMLButtonElement;
  private readonly crewMore: HTMLButtonElement;
  private readonly crewSlots: HTMLElement;
  private readonly crewCount: HTMLElement;
  private readonly crewNote: HTMLElement;
  /** Le sélecteur de priorité de travail : Basse, Moyenne, Haute. */
  private readonly priority: HTMLElement;
  private readonly priorityLabel: HTMLElement;
  private readonly priorityButtons: Map<WorkPriority, HTMLButtonElement>;
  private lastCrew = '';
  /** Le panneau Recherche, que seule la fenêtre du labo montre. */
  private readonly research: ResearchPanel;
  private readonly barracks: BarracksPanel;
  private readonly upgrade: HTMLElement;
  private readonly upgradeEffect: HTMLElement;
  private readonly upgradeCost: HTMLElement;
  private readonly upgradeButton: HTMLButtonElement;
  private lastText = '';
  /** Le compte à rebours de la production en cours (barre et « m:ss »), caché quand rien ne tourne. */
  private readonly production: HTMLElement;
  private readonly productionIcon: HTMLElement;
  private readonly productionFill: HTMLElement;
  private readonly productionValue: HTMLElement;
  /** Ce que la barre compte, dit par un tap sur elle (vide : rien à dire). */
  private productionLabel = '';
  /** `null` : rien d'affiché encore — une liste vide est une clé comme une autre. */
  private lastStats: string | null = null;
  private lastItems = '';
  private lastUpgrade = '';
  /** La forge d'équipement : l'arc suivant, son coût, « Forger l'arc ». */
  private readonly gear: HTMLElement;
  private readonly gearText: HTMLElement;
  private readonly gearCost: HTMLElement;
  private readonly gearButton: HTMLButtonElement;
  private lastGear = '';

  private entityId: EntityId | null = null;
  /** La base mutante affichée, si c'est elle qu'on a tapée. */
  private baseId: number | null = null;
  /** La créature affichée à la place d'un bâtiment, ou `null`. */
  private creatureId: MobileId | null = null;

  private readonly world: World;
  private readonly onOpen: () => void;

  public constructor(world: World, onOpen: () => void = () => {}) {
    this.world = world;
    this.onOpen = onOpen;

    this.root = document.createElement('section');
    this.root.className = 'panel building-panel building-window';
    this.root.hidden = true;

    const header = document.createElement('header');

    this.thumb = buildingIcon('townHall', 36);
    this.thumb.alt = '';
    this.thumb.setAttribute('aria-hidden', 'true');
    this.job = jobIcon('townHall', 24);
    this.title = document.createElement('h2');

    this.description = document.createElement('p');
    this.description.className = 'building-panel-description';
    this.description.id = 'building-panel-description';
    this.description.hidden = true;

    // La phrase d'ambiance ne prend de place que si on la demande.
    this.infoButton = document.createElement('button');
    this.infoButton.type = 'button';
    this.infoButton.className = 'building-panel-info';
    this.infoButton.setAttribute('aria-controls', this.description.id);
    this.infoButton.setAttribute('aria-expanded', 'false');
    this.infoButton.append(uiIcon('info', 26));
    this.infoButton.addEventListener('click', () => this.toggleDescription());

    const close = document.createElement('button');

    close.type = 'button';
    close.className = 'building-panel-close';
    close.append(uiIcon('close'));
    close.addEventListener('click', () => this.close());

    header.append(this.thumb, this.job, this.title, this.infoButton, close);

    this.meter = document.createElement('div');
    this.meter.className = 'building-panel-meter';
    this.meterIcon = document.createElement('span');
    this.meterIcon.className = 'building-panel-meter-icon';
    this.meterIcon.append(uiIcon('heart', 22));
    this.meterValue = document.createElement('span');
    this.meterValue.className = 'building-panel-meter-value';
    this.bar = document.createElement('div');
    this.bar.className = 'building-panel-bar';
    this.barFill = document.createElement('div');
    this.bar.append(this.barFill);
    this.meter.append(this.meterIcon, this.bar, this.meterValue);

    this.production = document.createElement('div');
    this.production.className = 'building-panel-meter building-panel-production';
    this.production.hidden = true;

    const productionBar = document.createElement('div');

    // Le bébé devant la barre dit ce qu'elle compte : la nurserie fait naître.
    this.productionIcon = document.createElement('span');
    this.productionIcon.className = 'building-panel-meter-icon';
    this.productionIcon.append(uiIcon('child', 22));
    this.productionIcon.hidden = true;
    productionBar.className = 'building-panel-bar';
    productionBar.dataset['kind'] = 'research';
    this.productionFill = document.createElement('div');
    productionBar.append(this.productionFill);
    this.productionValue = document.createElement('span');
    this.productionValue.className = 'building-panel-meter-value';
    this.production.append(this.productionIcon, productionBar, this.productionValue);
    this.production.addEventListener('click', () => {
      if (this.productionLabel) this.showTip(this.production, this.productionLabel);
    });

    this.stats = document.createElement('div');
    this.stats.className = 'building-panel-stats';
    this.stats.addEventListener('click', (event) => {
      const chip = (event.target as HTMLElement).closest<HTMLElement>('.building-panel-stat');

      if (chip) this.showTip(chip);
    });

    this.tip = document.createElement('div');
    this.tip.className = 'building-panel-tip';
    this.tip.setAttribute('role', 'status');
    this.tip.hidden = true;

    this.stock = document.createElement('div');
    this.stock.className = 'building-panel-stock';
    this.stock.setAttribute('role', 'img');
    this.stockCount = document.createElement('span');
    this.stock.append(uiIcon('chest', 20), this.stockCount);

    this.lines = document.createElement('pre');
    this.lines.className = 'building-panel-lines';

    this.facts = document.createElement('table');
    this.facts.className = 'building-panel-facts';
    this.facts.hidden = true;

    this.needs = document.createElement('div');
    this.needs.className = 'building-panel-needs';
    this.needs.hidden = true;

    // Le nom d'un habitant : un champ et son bouton, sous la fiche. Entrée valide.
    this.renameForm = document.createElement('form');
    this.renameForm.className = 'building-panel-rename';
    this.renameForm.hidden = true;
    this.renameInput = document.createElement('input');
    this.renameInput.type = 'text';
    this.renameInput.className = 'build-search-input';
    this.renameInput.maxLength = NAME_MAX;
    this.renameInput.autocomplete = 'off';
    this.renameInput.spellcheck = false;
    this.renameInput.enterKeyHint = 'done';
    this.renameButton = document.createElement('button');
    this.renameButton.type = 'submit';
    this.renameForm.append(this.renameInput, this.renameButton);
    this.renameForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.creatureId !== null) this.world.push({ type: 'renameInhabitant', id: this.creatureId, name: this.renameInput.value });
      this.renameInput.blur();
    });

    this.items = document.createElement('div');
    this.items.className = 'building-panel-items';

    this.actions = document.createElement('div');
    this.actions.className = 'building-panel-actions';

    this.transferButton = document.createElement('button');
    this.transferButton.type = 'button';
    this.transferButton.addEventListener('click', () => {
      if (this.entityId === null) return;

      // Le même bouton sert au chantier et aux bâtiments qui consomment.
      const kind = this.world.entities.get(this.entityId)?.kind;

      this.world.push({ type: kind === 'site' ? 'transferToSite' : 'supplyBuilding', id: this.entityId });
    });

    this.exchange = new TransferPanel(
      () => this.world.player.inventory,
      (command) => this.world.push(command),
    );
    this.exchange.root.hidden = true;

    this.repairButton = document.createElement('button');
    this.repairButton.type = 'button';
    this.repairButton.dataset['tone'] = 'upgrade';
    this.repairButton.addEventListener('click', () => {
      if (this.entityId !== null) this.world.push({ type: 'repairBuilding', id: this.entityId });
    });

    this.pauseButton = document.createElement('button');
    this.pauseButton.type = 'button';
    this.pauseButton.className = 'building-panel-pause';
    this.pauseButton.addEventListener('click', () => {
      const entity = this.entityId === null ? undefined : this.world.entities.get(this.entityId);

      if (entity && entity.kind !== 'site') this.world.push({ type: 'pauseBuilding', id: entity.id, paused: !entity.paused });
    });

    this.cancelButton = document.createElement('button');
    this.cancelButton.type = 'button';
    this.cancelButton.dataset['tone'] = 'cancel';
    this.cancelButton.addEventListener('click', () => {
      if (this.entityId === null) return;
      if (!this.cancelArmed) {
        this.cancelArmed = true;
        return;
      }
      this.world.push({ type: 'cancelSite', id: this.entityId });
    });

    this.actions.append(
      this.pauseButton,
      this.repairButton,
      this.transferButton,
      this.cancelButton,
    );

    this.crew = document.createElement('div');
    this.crew.className = 'building-panel-crew';

    const crewRow = document.createElement('div');

    crewRow.className = 'building-panel-crew-row';
    this.crewLess = crewButton('−', () => this.stepStaff(-1));
    this.crewMore = crewButton('+', () => this.stepStaff(1));
    this.crewSlots = document.createElement('div');
    this.crewSlots.className = 'building-panel-crew-slots';
    this.crewCount = document.createElement('span');
    this.crewCount.className = 'building-panel-crew-count';
    crewRow.append(this.crewLess, this.crewSlots, this.crewCount, this.crewMore);

    this.crewNote = document.createElement('p');
    this.crewNote.className = 'building-panel-crew-note';

    // Trois boutons segmentés, gros au pouce : celui de la priorité en cours est enfoncé.
    this.priority = document.createElement('div');
    this.priority.className = 'building-panel-priority';
    this.priorityLabel = document.createElement('span');
    this.priorityLabel.className = 'building-panel-priority-label';

    const segments = document.createElement('div');

    segments.className = 'building-panel-priority-segments';
    segments.setAttribute('role', 'group');
    this.priorityButtons = new Map(
      WORK_PRIORITIES.map((priority) => {
        const button = document.createElement('button');

        button.type = 'button';
        button.className = 'building-panel-priority-step';
        button.dataset['priority'] = priority;
        button.addEventListener('click', () => {
          if (this.entityId !== null) this.world.push({ type: 'setPriority', id: this.entityId, priority });
        });
        segments.append(button);
        return [priority, button];
      }),
    );
    this.priority.append(this.priorityLabel, segments);
    this.crew.append(crewRow, this.crewNote, this.priority);

    this.research = new ResearchPanel(world);
    this.research.root.hidden = true;
    this.barracks = new BarracksPanel(world);
    this.barracks.root.hidden = true;

    this.upgrade = document.createElement('div');
    this.upgrade.className = 'building-panel-upgrade';

    this.upgradeEffect = document.createElement('p');
    this.upgradeEffect.className = 'building-panel-upgrade-effect';

    this.upgradeCost = document.createElement('div');
    this.upgradeCost.className = 'building-panel-items';

    const upgradeActions = document.createElement('div');

    upgradeActions.className = 'building-panel-actions';
    this.upgradeButton = document.createElement('button');
    this.upgradeButton.type = 'button';
    this.upgradeButton.dataset['tone'] = 'upgrade';
    this.upgradeButton.addEventListener('click', () => {
      if (this.entityId !== null) this.world.push({ type: 'upgradeBuilding', id: this.entityId });
    });
    upgradeActions.append(this.upgradeButton);
    this.upgrade.append(this.upgradeEffect, this.upgradeCost, upgradeActions);

    this.gear = document.createElement('div');
    this.gear.className = 'building-panel-upgrade';
    this.gearText = document.createElement('p');
    this.gearText.className = 'building-panel-upgrade-effect';
    this.gearCost = document.createElement('div');
    this.gearCost.className = 'building-panel-items';

    const gearActions = document.createElement('div');

    gearActions.className = 'building-panel-actions';
    this.gearButton = document.createElement('button');
    this.gearButton.type = 'button';
    this.gearButton.dataset['tone'] = 'upgrade';
    this.gearButton.addEventListener('click', () => {
      if (this.entityId !== null) this.world.push({ type: 'craftGear', forge: this.entityId });
    });
    gearActions.append(this.gearButton);
    this.gear.append(this.gearText, this.gearCost, gearActions);

    this.tabs = new PanelTabs<BuildingTab>(
      [
        { id: 'building', icon: buildingIcon('townHall', 24) },
        { id: 'inventory', icon: uiIcon('chest', 24) },
      ],
      () => this.hideTip(),
    );
    this.tabs
      .page('building')
      .append(
        this.meter,
        this.production,
        this.stats,
        this.stock,
        this.items,
        this.lines,
        this.facts,
        this.needs,
        this.renameForm,
        this.crew,
        this.actions,
        this.upgrade,
        this.gear,
        this.research.root,
        this.barracks.root,
      );
    this.tabs.page('inventory').append(this.exchange.root);

    this.root.append(header, this.description, this.tabs.bar, this.tabs.pages, this.tip);

    // Les libellés fixes suivent la langue ; les caches tombent, la fenêtre ouverte se réécrit.
    onLocale(() => {
      const text = t().panel;

      this.infoButton.setAttribute('aria-label', text.about);
      close.setAttribute('aria-label', t().common.close);
      this.crewLess.setAttribute('aria-label', text.crew.less);
      this.crewMore.setAttribute('aria-label', text.crew.more);
      this.priorityLabel.textContent = text.crew.priority.label;
      segments.setAttribute('aria-label', text.crew.priority.label);
      for (const [priority, button] of this.priorityButtons) button.textContent = text.crew.priority[priority];
      this.tabs.bar.setAttribute('aria-label', text.tabs.label);
      this.renameInput.placeholder = text.creature.rename.placeholder;
      this.renameInput.setAttribute('aria-label', text.creature.rename.label);
      this.renameInput.title = text.creature.rename.hint;
      this.renameButton.textContent = text.creature.rename.confirm;
      this.tabs.setLabel('building', text.tabs.building);
      this.tabs.setLabel('inventory', text.tabs.inventory);
      this.transferButton.textContent = text.transferBag;
      this.lastText = '';
      this.lastStats = null;
      this.lastItems = '';
      this.lastUpgrade = '';
      this.lastGear = '';
      this.lastCrew = '';
      this.lastNeeds = '';
      this.update();
    });
  }

  public get open(): boolean {
    return this.entityId !== null || this.baseId !== null || this.creatureId !== null;
  }

  /** La créature affichée, ou `null`. */
  public get shownCreature(): MobileId | null {
    return this.creatureId;
  }

  /** Ce que la fenêtre montre, bâtiment ou créature — ce qu'entoure le cadre de sélection —, ou `null`. */
  public get selection(): Selection | null {
    if (this.entityId !== null) return { kind: 'building', id: this.entityId };
    if (this.creatureId !== null) return { kind: 'creature', id: this.creatureId };
    return null;
  }

  public show(id: EntityId): void {
    const entity = this.world.entities.get(id);

    if (!entity) return;

    this.entityId = id;
    this.baseId = null;
    this.creatureId = null;
    this.reveal();
    this.refresh(entity);
    this.onOpen();
  }

  /** La fenêtre d'une base mutante : son niveau, sa zone, sa vie, l'équipement qu'il faut. */
  public showBase(id: number): void {
    // Ce qu'on sait d'elle : en direct sous les yeux, sa dernière capture hors de vue.
    const base = this.world.knownEnemyBase(id);

    if (!base || !isStanding(base)) return;

    this.entityId = null;
    this.baseId = id;
    this.creatureId = null;
    this.reveal();
    this.refreshBase(base);
    this.onOpen();
  }

  /** Une créature — habitant ou ennemi — dans la même fenêtre qu'un bâtiment. */
  public showCreature(id: MobileId): void {
    const mobile = this.world.mobiles.get(id);

    if (!mobile || !isCreature(mobile)) return;

    this.entityId = null;
    this.baseId = null;
    this.creatureId = id;
    this.reveal();
    this.refreshCreature(creatureView(this.world, mobile));
    this.onOpen();
  }

  /** Ouvre la fenêtre, caches vidés, sans rien de l'occupant précédent. */
  private reveal(): void {
    this.root.hidden = false;
    this.lastText = '';
    this.lastStats = null;
    this.lastItems = '';
    this.lastUpgrade = '';
    this.lastGear = '';
    this.lastCrew = '';
    this.lastNeeds = '';
    // Les jauges de faim et de soif ne sont qu'à un habitant, la fiche qu'à une créature : `refreshCreature` les montre.
    this.needs.hidden = true;
    this.renameForm.hidden = true;
    this.renamed = null;
    this.facts.hidden = true;
    this.lastFacts = '';
    this.cancelArmed = false;
    // Rouverte, elle revient sur « Bâtiment ».
    this.tabs.select('building');
    this.setDescription(false);
    this.hideTip();
  }

  public close(): void {
    this.entityId = null;
    this.baseId = null;
    this.creatureId = null;
    this.hideTip();
    this.root.hidden = true;
  }

  /** À chaque frame : le contenu suit l'état, la fenêtre se ferme si l'entité a disparu. */
  public update(): void {
    if (this.baseId !== null) {
      const base = this.world.knownEnemyBase(this.baseId);

      // Abattue : sa fenêtre n'a plus rien à dire.
      if (!base || !isStanding(base)) this.close();
      else this.refreshBase(base);
      return;
    }
    if (this.creatureId !== null) {
      const mobile = this.world.mobiles.get(this.creatureId);

      if (mobile && isCreature(mobile)) this.refreshCreature(creatureView(this.world, mobile));
      else this.close();
      return;
    }
    if (this.entityId === null) return;

    const entity = this.world.entities.get(this.entityId);

    if (!entity) {
      this.close();
      return;
    }
    this.refresh(entity);
  }

  private refresh(entity: Entity): void {
    this.setProduction(entity);
    const proto = BUILDINGS[entity.proto];
    const text = t().panel;
    const paused = text.paused;
    const blocked = text.blocked;
    // Le problème que la bulle d'alerte montre sur la carte, expliqué en une ligne.
    const full = entity.kind !== 'site' && this.world.problem(entity) === 'storeFull';
    const lines: string[] = [];
    const stats: Stat[] = [];
    let ratio: number;
    let barClass: string;
    let meterValue = '';
    let meterLabel = '';

    const inReach = this.world.inReach(entity);

    // Le chantier devient le bâtiment sous le même id, le bâtiment change de niveau : le texte suit.
    this.title.textContent = entity.kind === 'site' ? t().buildings[entity.proto].label : levelText(entity.proto, entity.level).label;
    this.description.textContent = panelDescription(entity);

    const thumb = buildingIconUrl(entity.proto);

    if (this.thumb.src !== thumb) {
      this.thumb.src = thumb;
      this.job.src = jobIconUrl(entity.proto);
      this.tabs.setIcon('building', buildingIcon(entity.proto, 24));
    }
    this.job.hidden = false;

    // Le labo fini : sa fenêtre devient le panneau Recherche, qui a besoin de toute la place.
    const lab = entity.kind === 'lab';

    this.root.dataset['kind'] = entity.kind;
    this.meter.hidden = false;
    this.infoButton.hidden = lab;
    if (lab) this.setDescription(false);
    this.research.root.hidden = !lab;
    if (entity.kind === 'lab') this.research.update(entity);
    this.barracks.root.hidden = entity.kind !== 'barracks';
    if (entity.kind === 'barracks') this.barracks.update(entity, this.world.inReach(entity));

    delete this.items.dataset['layout'];
    if (entity.kind === 'site') {
      const total = Object.values(proto.cost).reduce((sum, amount) => sum + amount, 0);
      const missing = siteMissing(entity);
      const canGive = this.world.canTransfer(entity);
      const fromTown = this.world.inTownRange(entity);

      const building = this.world.awaitsBuilders(entity);

      ratio = total === 0 ? 1 : 1 - missing / total;
      barClass = 'progress';

      if (building) {
        // Tout est livré : la barre suit le marteau des bâtisseurs.
        const { done, total: work } = this.world.siteBuild(entity);
        const builders = this.world.siteBuilders(entity.id);

        ratio = work === 0 ? 1 : done / work;
        barClass = 'build';
        lines.push(
          builders === 0 ? text.site.allDelivered : text.site.building(builders, Math.floor(ratio * 100)),
        );
      } else {
        lines.push(
          this.world.builderYard(entity)
            ? text.site.byYard
            : !inReach
              ? text.site.comeCloser
              : !fromTown
                ? text.site.transferOrBump
                : siteCoverageText(this.world.siteCoverage(entity)),
        );
      }
      if (proto.workers > 0) stats.push({ icon: 'worker', value: String(proto.workers), label: text.site.workers(proto.workers) });

      // Objet par objet : livré / requis, puis ce qui est en route et ce que la ville en a.
      const ledger = this.world.siteLedger(entity);

      this.setItems(ledger.map(siteNeedRow), `site:${entity.id}:${JSON.stringify(ledger)}`);
      this.items.dataset['layout'] = 'ledger';
      this.transferButton.hidden = building;
      this.transferButton.textContent = this.world.townStock() ? text.transferButton : text.transferBag;
      this.transferButton.disabled = !inReach || !canGive;
      // Le chantier de la mairie ne s'annule pas.
      this.cancelButton.hidden = entity.id === this.world.townHallId;
      this.cancelButton.textContent = this.cancelArmed ? text.cancelConfirm : text.cancelSite;
      this.exchange.show(null);
      this.tabs.setAvailable('inventory', false);
      this.repairButton.hidden = true;
      this.pauseButton.hidden = true;
      this.crew.hidden = true;
      this.upgrade.hidden = true;
      this.gear.hidden = true;
      this.stock.hidden = true;
    } else {
      const level = buildingLevel(entity.proto, entity.level);

      ratio = entity.hp / level.hp;
      barClass = 'hp';
      meterValue = `${entity.hp}/${level.hp}`;
      meterLabel = text.hp(meterValue);

      const pausable = canPause(entity.proto);
      const stopped = this.world.stopped(entity);

      // Une nurserie ou une forge consomme : Adam vient la remplir. L'antenne attend son étage suivant.
      const consumer = entity.kind === 'nursery' || entity.kind === 'forge';
      const floor = entity.kind === 'antenna' && nextUpgrade(entity.proto, entity.level) !== null;

      // Abîmé : le bouton dit ce que coûte la remise à neuf, la ligne dit comment s'en passer.
      const cost = repairCost(entity);
      const stock = this.world.repairStock(entity);
      const material = t().items[REPAIR.item];

      if (cost > 0) {
        lines.push(stock === 0 ? text.repair.noStock(material, REPAIR.hp) : text.repair.damaged(material, REPAIR.hp));
      }
      this.repairButton.hidden = cost === 0;
      this.repairButton.disabled = !inReach || stock === 0;
      const repairLabel = text.repair.button(stock > 0 ? Math.min(cost, stock) : cost, material);

      if (this.repairButton.textContent !== repairLabel) this.repairButton.textContent = repairLabel;

      this.pauseButton.hidden = !pausable;
      this.pauseButton.textContent = entity.paused ? text.resume : text.pause;
      this.pauseButton.dataset['tone'] = entity.paused ? 'resume' : 'pause';
      this.refreshCrew(entity);
      this.cancelButton.hidden = true;
      this.transferButton.hidden = !consumer && !floor;
      this.transferButton.textContent = this.world.inTownRange(entity) ? text.transferButton : text.transferBag;
      this.transferButton.disabled = !inReach || !this.world.canSupply(entity);

      // Un coffre où échanger : la mairie, un producteur, une forge, une nurserie.
      const rules = this.world.transferRules(entity);

      this.tabs.setAvailable('inventory', rules !== null);
      this.exchange.show(
        rules && {
          id: entity.id,
          store: entity.store,
          rules,
          title: entity.kind === 'townHall' ? text.chest.town : text.chest.plain,
          icon: entity.kind === 'townHall' ? 'town' : 'chest',
          reachable: inReach,
        },
      );

      switch (entity.kind) {
        case 'townHall': {
          const { adults, children, workers } = this.world.population();

          stats.push(
            { icon: 'people', value: String(adults), label: text.townHall.adults(adults) },
            { icon: 'child', value: String(children), label: text.townHall.children(children) },
            { icon: 'worker', value: String(workers), label: text.townHall.workers(workers) },
            { icon: 'moon', value: String(this.world.night), label: text.townHall.nights(this.world.night) },
            { icon: 'range', value: String(proto.logisticRadius), label: text.townHall.radius(proto.logisticRadius) },
          );
          break;
        }

        case 'drill':
          lines.push(entity.output ? text.drill.extracts(t().items[entity.output]) : text.drill.dry);
          lines.push(entity.paused ? paused : full ? text.storeFull : entity.output ? text.drill.running : '');
          break;

        case 'nursery': {
          const kids = this.world.nurseryKids(entity).length;
          const adult = this.world.nextAdultTicks(entity);

          lines.push(text.nursery.perBirth(recipeLine(RECIPES.raiseChild.inputs)));
          lines.push(
            entity.paused
              ? paused
              : kids >= NURSERY_CARE.capacity
                ? text.nursery.full
                : entity.hungry
                  ? text.nursery.hungry(starvedLine(this.world, entity))
                  : '',
          );
          lines.push(adult === null ? text.nursery.noKids : text.nursery.nextAdult(clock(adult)));
          stats.push(
            {
              icon: 'child',
              value: `${kids}/${NURSERY_CARE.capacity}`,
              label: text.nursery.kids(kids, NURSERY_CARE.capacity),
            },
            { icon: 'worker', value: String(entity.born), label: text.nursery.born(entity.born) },
          );
          // Son stock de nourriture, rapporté au stock visé, et ce qui est en route.
          for (const item of Object.keys(RECIPES.raiseChild.inputs) as ItemId[]) {
            const count = entity.store.count(item);
            const target = consumerTarget(entity, item);
            const coming = entity.store.expected(item);

            stats.push({
              icon: 'chest',
              item,
              value: `${count}/${target}${coming > 0 ? ` +${coming}` : ''}`,
              label: text.nursery.stock(t().items[item], count, target, coming),
            });
          }
          break;
        }

        case 'forge': {
          // La forge fond des plaques, le four à charbon cuit le bois : chacun sa recette.
          const recipe = forgeRecipe(entity);

          lines.push(`${recipeLine(recipe.inputs)} → ${recipeLine(recipe.outputs)}`);
          lines.push(
            entity.paused
              ? paused
              : stopped
                ? text.forge.noOne
                : entity.blocked
                ? this.world.supplyStatus(entity)
                  ? text.forge.starved(starvedLine(this.world, entity))
                  : blocked
                : text.forge.heating,
          );
          break;
        }

        case 'tower': {
          const weapon = level.weapon ? WEAPONS[level.weapon] : null;

          if (level.weapon && weapon) {
            stats.push({ icon: 'range', value: String(weapon.range), label: text.tower.range(t().weapons[level.weapon], weapon.range) });
          }
          lines.push(entity.armed ? text.tower.alert : text.tower.idle);
          break;
        }

        case 'farm': {
          const count = countField(this.world.farmField(entity));

          stats.push(
            { icon: 'seed', value: String(count.growing), label: text.farm.growing(count.growing) },
            { icon: 'wheat', value: String(count.ripe), label: text.farm.ripe(count.ripe) },
            { icon: 'plot', value: String(count.free), label: text.farm.free(count.free) },
          );
          lines.push(text.farm.field(FARMERS.plot));
          lines.push(
            entity.paused
              ? text.farm.paused
              : full
                ? text.storeFull
                : stopped
                  ? text.farm.noOne
                  : farmLine(this.world.farmerOf(entity), count),
          );
          break;
        }

        case 'quarry': {
          // Le puits est une carrière sur sa propre recette : ses mots à lui.
          const words = entity.proto === 'well' ? text.well : text.quarry;

          lines.push(entity.paused ? paused : full ? text.storeFull : stopped ? words.noOne : words.working);
          break;
        }

        case 'house':
          // La Maison n'emploie personne : ses lits sont à qui n'en a pas.
          lines.push(proto.workers > 0 ? text.house.sleeping : text.house.beds);
          break;

        case 'lab':
          // Tout est dans le panneau Recherche, sous les points de vie.
          break;

        case 'lumberCamp':
          stats.push({
            icon: 'range',
            value: String(LUMBERJACKS.radius),
            label: text.lumberCamp.radius(LUMBERJACKS.radius),
          });
          lines.push(
            entity.paused
              ? text.lumberCamp.paused
              : full
                ? text.storeFull
                : stopped
                  ? text.lumberCamp.noOne
                  : this.world.treesLeft(entity) === 0
                    ? text.lumberCamp.noTrees
                    : text.lumberCamp.working,
          );
          break;

        case 'foresterHouse': {
          const tiles = this.world.forestPlot(entity);
          const count = countPlot(tiles);

          stats.push(
            { icon: 'seed', value: String(count.saplings), label: text.foresterHouse.saplings(count.saplings) },
            { icon: 'tree', value: String(count.trees), label: text.foresterHouse.trees(count.trees) },
            { icon: 'plot', value: String(count.free), label: text.foresterHouse.free(count.free) },
          );
          lines.push(text.foresterHouse.plot(FORESTERS.plot));
          lines.push(entity.paused ? text.foresterHouse.paused : stopped ? text.foresterHouse.noOne : foresterLine(this.world.foresterOf(entity), count));
          break;
        }

        case 'depot': {
          const served = this.world.depotProducers(entity);

          stats.push({
            icon: 'range',
            value: String(LOGISTICIANS.radius),
            label: text.depot.radius(LOGISTICIANS.radius),
          });
          lines.push(served === 0 ? text.depot.none : text.depot.served(served));
          break;
        }

        case 'yard': {
          const served = this.world.yardSites(entity);

          stats.push({
            icon: 'range',
            value: String(BUILDERS.radius),
            label: text.yard.radius(BUILDERS.radius),
          });
          lines.push(
            entity.paused
              ? text.yard.paused
              : stopped
                ? text.yard.noOne
                : served === 0
                  ? text.yard.none
                  : text.yard.served(served),
          );
          break;
        }

        case 'antenna': {
          const max = maxLevel(entity.proto);
          const lure = this.world.lureNight;
          const clock = this.world.clock();

          lines.push(text.antenna.floor(entity.level, max));
          lines.push(floor ? text.antenna.nextFloor : text.antenna.signalSent);
          if (lure > this.world.night) lines.push(text.antenna.lureNight(lure));
          else if (lure === this.world.night && clock?.phase === 'night') lines.push(text.antenna.lureTonight);
          break;
        }

        case 'clinic': {
          const used = this.world.clinicBedsUsed(entity.id);

          stats.push({ icon: 'people', value: `${used}/${CLINIC.beds}`, label: text.clinic.beds(used, CLINIC.beds) });
          lines.push(used >= CLINIC.beds ? text.clinic.full : text.clinic.open);
          break;
        }
      }

      // Ses lits : combien sont pris, sur combien — sa part de l'Habitation.
      const beds = bedsOf(entity.proto);

      if (beds > 0) {
        const used = this.world.sleepersIn(entity.id).length;

        stats.push({ icon: 'home', value: `${used}/${beds}`, label: text.house.bedsTaken(used, beds) });
      }

      // Le coffre de la mairie est le stock de la ville. Un coffre où échanger se lit dans la zone d'échange,
      // celui du labo dans le panneau Recherche, celui de l'antenne en jauges de son étage suivant, comme un chantier.
      if (rules) {
        this.stock.hidden = true;
        this.setItems([], 'exchange');
      } else if (entity.kind === 'antenna') {
        const cost = floorCost(entity);

        this.stock.hidden = true;
        this.setItems(
          cost.map(([item, needed]) => itemAmount(item, needed, entity.store.count(item))),
          `floor:${entity.id}:${entity.level}:${cost.map(([item]) => `${item}=${entity.store.count(item)}`).join(',')}`,
        );
      } else if (proto.storage > 0 && !lab) {
        const capacity = Number.isFinite(proto.storage) ? `/${proto.storage}` : '';
        const entries = entity.store.entries();
        const label = text.chest.label(`${entity.store.total()}${capacity}`);
        // Sans plafond, un coffre ne dit son compte que vide.
        const count = entries.length === 0 ? text.chest.empty : capacity ? `${entity.store.total()}${capacity}` : '';

        this.stock.hidden = false;
        this.stock.setAttribute('aria-label', entries.length ? label : text.chest.emptyLabel(label));
        this.stock.title = label;
        if (this.stockCount.textContent !== count) this.stockCount.textContent = count;
        this.setItems(
          entries.map(([item, amount]) => itemAmount(item, amount)),
          `store:${entity.id}:${entries.map(([item, amount]) => `${item}=${amount}`).join(',')}`,
        );
      } else {
        this.stock.hidden = true;
        this.setItems([], 'none');
      }
      this.refreshUpgrade(entity, inReach);
      this.refreshGear(entity, inReach);
    }

    this.finish(stats, lines, ratio, barClass, meterValue, meterLabel);
  }

  /** La base mutante : la même fenêtre, sans bouton ni coffre. */
  private refreshBase(base: EnemyBase): void {
    const text = t().panel.enemyBase;
    const level = enemyBaseLevel(base.level);
    const gear = t().gear[base.level] ?? '';
    const meterValue = `${base.hp}/${level.hp}`;

    this.title.textContent = t().enemyBase.label;
    this.description.textContent = t().enemyBase.description;

    const thumb = enemyBaseIconUrl();

    if (this.thumb.src !== thumb) this.thumb.src = thumb;
    this.job.hidden = true;
    this.root.dataset['kind'] = 'enemyBase';
    this.meter.hidden = false;
    this.production.hidden = true;
    this.infoButton.hidden = false;
    this.research.root.hidden = true;
    this.barracks.root.hidden = true;
    for (const part of [this.crew, this.upgrade, this.gear, this.stock]) part.hidden = true;
    this.exchange.show(null);
    this.tabs.setAvailable('inventory', false);
    for (const button of [this.pauseButton, this.repairButton, this.transferButton, this.cancelButton]) button.hidden = true;
    delete this.items.dataset['layout'];
    this.setItems([], 'none');

    const night = this.world.clock()?.cycle ?? 1;
    const capacity = raidCapacity(base.level, night);
    const stats: Stat[] = [
      { icon: 'goal', value: String(base.level), label: text.level(base.level) },
      { icon: 'range', value: String(level.zoneRadius), label: text.zone(level.zoneRadius) },
      { icon: 'flame', value: String(level.fire.damage), label: text.fire(level.fire.range, level.fire.damage) },
      { icon: 'moon', value: `${base.raiders}/${capacity}`, label: text.raiders(base.raiders, capacity) },
      { icon: 'mutant', value: `${base.guards}/${level.guards.count}`, label: text.guards(base.guards, level.guards.count) },
      { icon: 'mutant', value: `${base.spitters}/${level.guards.spitters}`, label: text.spitters(base.spitters, level.guards.spitters) },
    ];
    const shielded = isShielded(base);

    // Le chef en tête : c'est lui qu'il faut abattre d'abord.
    if (shielded) {
      stats.unshift({ icon: 'shield', value: `${Math.ceil(base.chief)}/${level.chief.hp}`, label: text.chief(Math.ceil(base.chief), level.chief.hp) });
    }

    const lines = [
      ...(shielded ? [text.shielded, text.chiefReward(level.chief.prestige + KILL_PRESTIGE.chief)] : []),
      text.fireWarning,
      capacity > 0 ? text.raid : text.asleep(level.raid.from),
      text.required(gear, base.level),
      canDamage(base, this.world.player.gear) ? text.ready : text.weak,
      text.prestige(level.prestige),
    ];

    this.finish(stats, lines, base.hp / level.hp, 'hp', meterValue, t().panel.hp(meterValue));
  }

  /** Puces, lignes, barre : la fin commune d'un bâtiment et d'une base. */
  private finish(stats: readonly Stat[], lines: readonly string[], ratio: number, barClass: string, meterValue: string, meterLabel: string): void {
    this.setStats(stats);

    // Plus aucun bouton à montrer : la rangée disparaît.
    this.actions.hidden = [...this.actions.children].every((button) => (button as HTMLElement).hidden);
    this.setBody(lines, ratio, barClass, meterValue, meterLabel);
  }

  /**
   * Une créature : portrait et nom en tête, ses points de vie s'il en a, son
   * âge en puce, ce qu'elle porte, puis ses lignes. Tout ce qui est d'un
   * bâtiment — coffre, boutons, ouvriers, niveaux, recherche — se cache.
   */
  private refreshCreature(view: CreatureView): void {
    const text = t().panel;

    this.root.dataset['kind'] = 'creature';
    this.title.textContent = view.name;

    const thumb = creatureIconUrl(view.portrait, view.sex === 'female');

    if (this.thumb.src !== thumb) this.thumb.src = thumb;
    this.job.hidden = true;
    this.infoButton.hidden = true;
    this.setDescription(false);
    this.research.root.hidden = true;
    this.barracks.root.hidden = true;
    this.exchange.show(null);
    this.tabs.setAvailable('inventory', false);
    for (const part of [this.crew, this.upgrade, this.gear, this.stock]) part.hidden = true;
    for (const button of this.actions.children) (button as HTMLElement).hidden = true;
    this.actions.hidden = true;

    // L'âge est une ligne de la fiche : pas de puce.
    this.setStats([]);
    this.setItems([], 'creature');
    this.setFacts(view.facts);
    this.setNeeds(view.needs, view.happiness);

    // Le champ prend le nom de l'habitant ouvert, puis n'y touche plus : on peut y taper tranquille.
    this.renameForm.hidden = !view.renamable;
    if (this.renamed !== this.creatureId) {
      this.renamed = this.creatureId;
      this.renameInput.value = view.name;
    }

    const { hp } = view;

    // Un habitant n'a pas de points de vie : pas de jauge.
    this.meter.hidden = hp === null;
    this.production.hidden = true;
    if (hp) {
      const value = `${hp.value}/${hp.max}`;

      this.setBody([], hp.value / hp.max, 'hp', value, text.hp(value));
    } else {
      this.setBody([], 0, 'hp', '', '');
    }
  }

  /** Le tableau d'une créature, reconstruit seulement quand une ligne change : libellé à gauche, valeur à droite. */
  private setFacts(facts: CreatureView['facts']): void {
    const key = facts.map(({ label, value, symbol }) => `${label}:${symbol ?? ''}${value}`).join('|');

    this.facts.hidden = facts.length === 0;
    if (key === this.lastFacts) return;
    this.lastFacts = key;
    this.facts.replaceChildren(
      ...facts.map(({ label, value, symbol }) => {
        const row = document.createElement('tr');
        const head = document.createElement('th');
        const cell = document.createElement('td');

        head.scope = 'row';
        head.textContent = label;
        if (symbol) {
          const mark = uiIcon(symbol, 18);

          // L'image est décorative ; le symbole reste dans le texte, pour la lecture d'écran.
          mark.classList.add('building-panel-facts-symbol');
          cell.setAttribute('aria-label', `${SEX_SYMBOLS[symbol]} ${value}`);
          cell.append(mark, value);
        } else {
          cell.textContent = value;
        }
        row.append(head, cell);
        return row;
      }),
    );
  }

  /** La barre et le « m:ss » de la production en cours, s'il y en a une ; chaque frame, à peu de frais. */
  private setProduction(entity: Entity): void {
    // Le labo a sa barre dans le panneau Recherche : une seule par fiche.
    const timer = entity.kind === 'lab' ? null : this.world.productionTimer(entity);

    this.production.hidden = timer === null;
    if (!timer) return;

    const left = timerText(timer.left);
    const nursery = entity.kind === 'nursery';

    this.productionIcon.hidden = !nursery;
    this.productionLabel = nursery ? t().panel.nursery.nextChild : '';
    this.productionFill.style.width = `${Math.round((1 - timer.left / timer.total) * 100)}%`;
    if (this.productionValue.textContent !== left) {
      this.productionValue.textContent = left;
      this.production.setAttribute('role', 'img');
      this.production.setAttribute('aria-label', t().researchPanel.remaining(left));
    }
  }

  /** Les jauges d'un habitant, une par besoin, puis son bonheur ; reconstruites quand l'une bouge d'un centième. */
  private setNeeds(needs: CreatureView['needs'], happiness: number | null): void {
    const key = `${needs.map(({ need, value }) => `${need}:${Math.round(value * 100)}`).join('|')}|mood:${happiness === null ? '' : Math.round(happiness)}`;

    this.needs.hidden = needs.length === 0 && happiness === null;
    if (key === this.lastNeeds) return;
    this.lastNeeds = key;
    this.needs.replaceChildren(...needs.map(({ need, value }) => needMeter(need, value)), ...(happiness === null ? [] : [moodMeter(happiness)]));
  }

  /** Les lignes, puis la jauge : cœur (ou rien pour un chantier), barre, nombre. */
  private setBody(lines: readonly string[], ratio: number, barClass: string, meterValue: string, meterLabel: string): void {
    const body = lines.filter(Boolean).join('\n');
    const width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;

    this.lines.hidden = body === '';
    if (this.lines.textContent !== body) this.lines.textContent = body;
    if (`${barClass}:${width}:${meterValue}` === this.lastText) return;
    this.lastText = `${barClass}:${width}:${meterValue}`;
    this.bar.dataset['kind'] = barClass;
    this.barFill.style.width = width;
    // Un chantier n'a que sa barre ; un bâtiment, son cœur et ses points de vie.
    this.meterIcon.hidden = meterValue === '';
    this.meterValue.textContent = meterValue;
    if (meterLabel) {
      this.meter.setAttribute('role', 'img');
      this.meter.setAttribute('aria-label', meterLabel);
    } else {
      this.meter.removeAttribute('role');
      this.meter.removeAttribute('aria-label');
    }
  }

  /** Les puces ne sont reconstruites que si l'une change. */
  private setStats(stats: readonly Stat[]): void {
    const key = stats.map(({ icon, item, value, label }) => `${item ?? icon}:${value}:${label}`).join('|');

    if (key === this.lastStats) return;
    this.lastStats = key;
    this.stats.replaceChildren(...stats.map(statChip));
    this.stats.hidden = stats.length === 0;
  }

  /** Un tap sur une puce : son libellé dans une bulle au-dessus d'elle, le temps de le lire. */
  private showTip(chip: HTMLElement, label = chip.getAttribute('aria-label') ?? ''): void {
    this.tip.textContent = label;
    this.tip.hidden = false;
    // La bulle reste dans la fenêtre : centrée sur la puce, bornée aux bords.
    const width = this.tip.offsetWidth;
    const center = chip.offsetLeft + chip.offsetWidth / 2;
    const left = Math.max(8, Math.min(this.root.clientWidth - width - 8, center - width / 2));

    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${chip.offsetTop - this.tip.offsetHeight - 6}px`;
    window.clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => this.hideTip(), TIP_MS);
  }

  private hideTip(): void {
    window.clearTimeout(this.tipTimer);
    this.tipTimer = undefined;
    this.tip.hidden = true;
  }

  private toggleDescription(): void {
    // La fenêtre grandit : la bulle ne serait plus sur sa puce.
    this.hideTip();
    this.setDescription(this.infoButton.getAttribute('aria-expanded') !== 'true');
  }

  private setDescription(open: boolean): void {
    this.description.hidden = !open;
    this.infoButton.setAttribute('aria-expanded', String(open));
  }

  /** Le sélecteur d'ouvriers : un pictogramme par poste — occupé, libre, ou demandé mais vide. */
  private refreshCrew(building: Building): void {
    const staffing = this.world.staffing(building);

    this.crew.hidden = staffing === null;
    if (!staffing) return;

    const { min, max, wanted, filled } = staffing;
    const key = `${building.id}:${wanted}:${filled}:${max}`;

    this.crewLess.disabled = wanted <= min;
    this.crewMore.disabled = wanted >= max;
    for (const [priority, button] of this.priorityButtons) {
      button.setAttribute('aria-pressed', String(priority === building.priority));
    }
    if (key === this.lastCrew) return;
    this.lastCrew = key;

    this.crewSlots.replaceChildren(
      ...Array.from({ length: max }, (_, slot) => {
        const cell = document.createElement('span');

        // Occupé, demandé mais sans ouvrier libre, ou fermé.
        cell.className = 'building-panel-crew-slot';
        cell.dataset['slot'] = slot < filled ? 'filled' : slot < wanted ? 'missing' : 'empty';
        cell.append(uiIcon('worker', 26));
        return cell;
      }),
    );
    this.crewCount.textContent = `${wanted}/${max}`;

    const missing = wanted - filled;

    const text = t().panel.crew;

    this.crewNote.textContent =
      missing > 0 ? text.missing(missing) : wanted === 0 ? text.none : text.assigned(filled, max - wanted);
    this.crewNote.dataset['missing'] = String(missing > 0);
  }

  /** − ou + : l'effectif voulu, poussé en commande ; la simulation le borne. */
  private stepStaff(delta: number): void {
    const entity = this.entityId === null ? undefined : this.world.entities.get(this.entityId);

    if (!entity || entity.kind === 'site') return;
    this.world.push({ type: 'setWorkers', id: entity.id, count: entity.staff + delta });
  }

  /** Le niveau suivant : ce qu'il apporte, ce qu'il coûte, ce qui manque ; ou « Niveau max ». */
  private refreshUpgrade(entity: Exclude<Entity, { kind: 'site' }>, inReach: boolean): void {
    const proto = BUILDINGS[entity.proto];
    const upgrade = nextUpgrade(entity.proto, entity.level);

    // Les étages de l'antenne se livrent : pas de bouton qui les achète d'un coup.
    this.upgrade.hidden = proto.upgrades.length === 0 || entity.kind === 'antenna';
    if (this.upgrade.hidden) return;

    const missing = this.world.upgradeMissing(entity) ?? {};
    const short = Object.keys(missing).length > 0;

    this.upgradeButton.disabled = !upgrade || !inReach || short;

    const key = `${entity.id}:${entity.level}:${inReach}:${JSON.stringify(missing)}`;

    if (key === this.lastUpgrade) return;
    this.lastUpgrade = key;

    if (!upgrade) {
      this.upgradeEffect.textContent = '';
      this.upgradeEffect.hidden = true;
      this.upgradeCost.replaceChildren();
      this.upgradeCost.hidden = true;
      this.upgradeButton.textContent = t().panel.maxLevel;
      return;
    }

    const text = t().panel.upgrade;
    // Le niveau suivant est `entity.level + 1` : son texte est `upgrades[entity.level - 1]`.
    const action = t().buildings[entity.proto].upgrades[entity.level - 1]?.action ?? '';

    this.upgradeEffect.hidden = false;
    this.upgradeEffect.textContent =
      text.effect(action, upgradeEffect(buildingLevel(entity.proto, entity.level), upgrade)) + (inReach ? '' : text.comeCloser);
    this.upgradeCost.hidden = false;
    this.upgradeCost.replaceChildren(
      ...(Object.entries(upgrade.cost) as [ItemId, number][]).map(([item, needed]) => {
        const row = itemAmount(item, needed);
        const lacking = missing[item] ?? 0;

        if (lacking > 0) {
          const note = document.createElement('span');

          row.dataset['missing'] = 'true';
          note.className = 'item-missing';
          note.textContent = text.lacking(lacking);
          row.append(note);
        }
        return row;
      }),
    );
    this.upgradeButton.textContent = action;
  }

  /** L'arc suivant, sur la forge : son coût, ce qui manque, « Forger l'arc » ; ou le meilleur arc déjà en main. */
  private refreshGear(entity: Building, inReach: boolean): void {
    this.gear.hidden = entity.proto !== GEAR_WORKSHOP;
    if (this.gear.hidden) return;

    const level = this.world.player.gear;
    const missing = this.world.gearMissing(entity);
    const short = missing !== null && Object.keys(missing).length > 0;
    const text = t().panel.gear;

    this.gearButton.disabled = missing === null || !inReach || short;

    const key = `${level}:${inReach}:${JSON.stringify(missing)}`;

    if (key === this.lastGear) return;
    this.lastGear = key;

    const current = text.current(t().gear[level] ?? '', level);

    if (missing === null) {
      this.gearText.textContent = `${current} · ${text.best}`;
      this.gearCost.replaceChildren();
      this.gearCost.hidden = true;
      this.gearButton.textContent = t().panel.maxLevel;
      return;
    }

    this.gearText.textContent = `${current} · ${text.next(t().gear[level + 1] ?? '', level + 1)}${inReach ? '' : text.comeCloser}`;
    this.gearCost.hidden = false;
    this.gearCost.replaceChildren(
      ...(Object.entries(gearOf(level + 1).cost) as [ItemId, number][]).map(([item, needed]) => {
        const row = itemAmount(item, needed);
        const lacking = missing[item] ?? 0;

        if (lacking > 0) {
          const note = document.createElement('span');

          row.dataset['missing'] = 'true';
          note.className = 'item-missing';
          note.textContent = t().panel.upgrade.lacking(lacking);
          row.append(note);
        }
        return row;
      }),
    );
    this.gearButton.textContent = text.button;
  }

  /** Les lignes d'objets ne sont reconstruites que si leur clé change. */
  private setItems(children: HTMLElement[], key: string): void {
    if (key === this.lastItems) return;
    this.lastItems = key;
    this.items.replaceChildren(...children);
    this.items.hidden = children.length === 0;
  }

  public destroy(): void {
    this.root.remove();
  }
}

/**
 * Une puce « pictogramme + nombre ». Un bouton, pour que le tap et le clavier
 * l'atteignent : il ne fait qu'afficher son libellé.
 */
function statChip({ icon, item, value, label }: Stat): HTMLButtonElement {
  const chip = document.createElement('button');

  chip.type = 'button';
  chip.className = 'building-panel-stat';
  chip.setAttribute('aria-label', label);
  chip.title = label;
  const picture = item ? itemIcon(item, 20) : uiIcon(icon, 20);

  // La puce porte déjà son libellé : l'icône de l'objet n'est qu'un décor.
  picture.alt = '';
  picture.setAttribute('aria-hidden', 'true');
  chip.append(picture, value);
  return chip;
}

/** Un bouton rond du sélecteur d'ouvriers ; son `aria-label` suit la langue. */
function crewButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');

  button.type = 'button';
  button.className = 'building-panel-crew-step';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

/** Texte d'inspection : celui du chantier tant qu'il en est un, celui du bâtiment à son niveau ensuite. */
export function panelDescription(entity: Entity): string {
  return entity.kind === 'site' ? t().buildings[entity.proto].siteDescription : levelText(entity.proto, entity.level).description;
}

/** Nom et description d'un bâtiment à son niveau, dans la langue en cours (1 = tel que bâti). */
function levelText(id: BuildingId, level: number): { label: string; description: string } {
  const text = t().buildings[id];

  return (level <= 1 ? undefined : text.upgrades[level - 2]) ?? text;
}

/** Ce que « Transférer » ferait d'un chantier à portée de la ville, en disant d'où vient la matière. */
export function siteCoverageText(coverage: SiteCoverage): string {
  return t().panel.site.coverage[coverage];
}

/** Ce qu'apporte un niveau : « PV 60 → 90, portée 8 → 10, cadence +29 % ». */
export function upgradeEffect(from: BuildingLevel, to: BuildingLevel): string {
  const text = t().panel.upgrade;
  const parts: string[] = [];

  if (to.hp !== from.hp) parts.push(text.hp(from.hp, to.hp));

  const before = from.weapon ? WEAPONS[from.weapon] : null;
  const after = to.weapon ? WEAPONS[to.weapon] : null;

  if (after && after.range !== before?.range) parts.push(text.range(before?.range ?? 0, after.range));
  if (before && after && after.cooldown !== before.cooldown) {
    const faster = Math.round((before.cooldown / after.cooldown - 1) * 100);

    parts.push(text.rate(faster));
  }
  return parts.join(', ');
}

/** « 2 minerai de fer + 1 charbon » à partir des quantités d'une recette. */
/**
 * D'où vient la famine d'une forge ou d'une nurserie : ce qui manque est-il
 * en route, en ville, dans le sac — ou nulle part ?
 */
function starvedLine(world: World, consumer: Nursery | Forge): string {
  const status = world.supplyStatus(consumer);

  if (!status) return '';

  const label = t().items[status.item];
  const text = t().panel.starved;

  if (status.coming) return text.coming(label);
  if (status.inTown > 0) {
    return status.porters
      ? text.inTown(label, status.inTown)
      : text.noPorter(label, status.inTown, world.inTownRange(consumer));
  }
  if (world.player.inventory.count(status.item) > 0) return text.inBag(label);
  return text.nowhere(label);
}

function recipeLine(amounts: RecipeProto['inputs']): string {
  return (Object.entries(amounts) as [ItemId, number][])
    .map(([item, amount]) => t().panel.recipeAmount(amount, t().items[item]))
    .join(' + ');
}

/** « 9 min 32 s » à partir d'un nombre de ticks. */
function clock(ticks: number): string {
  const seconds = Math.ceil(ticks / TICKS_PER_SECOND);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return t().panel.duration(minutes, rest);
}

/** Ce que font les fermiers — vu du premier : ils sèment, récoltent, dorment, ou attendent que le champ mûrisse. */
function farmLine(farmer: Farmer | undefined, count: FieldCount): string {
  const text = t().panel.farm;

  if (farmer?.state === 'toSow' || farmer?.state === 'sow') return text.sowing;
  if (farmer?.state === 'toHarvest' || farmer?.state === 'harvest' || farmer?.state === 'toFarm') return text.harvesting;
  if (count.free + count.growing + count.ripe === 0) return text.nowhere;
  return farmer?.inside ? text.asleep : text.growingLine;
}

/** Ce que fait le forestier : il marche vers sa case, il plante, il dort, ou il n'a plus rien à planter — et pourquoi. */
function foresterLine(forester: Forester | undefined, count: PlotCount): string {
  const text = t().panel.foresterHouse;

  if (forester?.state === 'toPlot') return text.toPlot;
  if (forester?.state === 'plant') return text.planting;
  if (count.free === 0) return count.saplings + count.trees === 0 ? text.nowhere : text.full;
  return forester?.inside ? text.asleep : text.seeking;
}
