/**
 * Écrans plein cadre : l'écran titre et la pause.
 *
 * L'écran titre n'est pas décoratif. Sur mobile, le son ne peut démarrer
 * qu'après un geste : le bouton « Jouer » est ce geste, et la partie ne
 * commence qu'à ce moment-là — le joueur n'arrive pas au milieu d'une
 * simulation déjà lancée. Derrière le voile, la carte est déjà dessinée : on
 * voit le monde dans lequel on va entrer.
 *
 * Quand une partie est sauvegardée, l'écran titre propose « Continuer » (le
 * choix par défaut) et « Nouvelle partie ». Recommencer efface la colonie :
 * les deux écrans le font confirmer avant.
 *
 * L'écran titre ouvre aussi le jardin des souvenirs (`garden.ts`), où l'on
 * plante les graines des colonies tombées, et rappelle le record : les nuits
 * tenues après le Signal, par la meilleure colonie.
 *
 * Les libellés suivent la langue (`onLocale`) : l'engrenage de l'écran titre
 * ouvre les réglages avant même de jouer.
 *
 * Aucun de ces écrans ne touche au monde ni à la sauvegarde : ils disent à
 * `main.ts` de jouer, d'arrêter l'horloge ou de recommencer, et c'est tout.
 */

import { onLocale, t } from '../i18n/locale.ts';
import { progressOf, type Collection } from '../sim/collection.ts';
import type { Garden } from '../sim/garden.ts';
import { CollectionPanel } from './collectionPanel.ts';
import { GardenPanel, type GardenActions } from './garden.ts';
import { buildingIcon, itemIcon, uiIcon } from './icons.ts';
import { seedLine } from './seed.ts';

export interface TitleOptions {
  /** Une partie sauvegardée attend : « Continuer » et « Nouvelle partie » remplacent « Jouer ». */
  resume: boolean;
  /** Une ligne discrète sous les boutons — une vieille sauvegarde ignorée, par exemple ; relue à chaque langue. */
  notice?: () => string;
  onPlay: () => void;
  /** « Nouvelle partie », confirmée : la sauvegarde est à effacer. */
  onRestart: () => void;
  /** Le jardin des souvenirs, et de quoi y planter. */
  garden: Garden;
  /** Le record « nuits tenues après le Signal » ; 0 tant qu'aucune antenne n'a parlé. */
  record: number;
  gardenActions: GardenActions;
  /** La collection de succès : l'écran titre l'ouvre. */
  collection: () => Collection;
  /** L'engrenage du coin : le menu des réglages, la langue d'abord. */
  onSettings: () => void;
}

export class TitleScreen {
  public readonly root: HTMLElement;
  private readonly unsubscribe: () => void;

  public constructor({ resume, notice, onPlay, onRestart, garden, gardenActions, record, collection, onSettings }: TitleOptions) {
    this.root = document.createElement('div');
    this.root.className = 'overlay title-screen';

    // Les libellés fixes, réécrits à chaque langue ; `relabel` les rassemble.
    const labels: (() => void)[] = [];

    const settings = document.createElement('button');

    settings.type = 'button';
    settings.className = 'hud-button title-settings';
    settings.setAttribute('aria-haspopup', 'dialog');
    settings.append(uiIcon('settings'));
    settings.addEventListener('click', onSettings);
    labels.push(() => settings.setAttribute('aria-label', t().settings.title));

    const panel = document.createElement('div');

    panel.className = 'title-panel';

    const kicker = document.createElement('div');

    kicker.className = 'title-kicker';

    const title = document.createElement('h1');

    title.className = 'title-logo';

    const pitch = document.createElement('p');

    pitch.className = 'title-pitch';
    labels.push(() => {
      kicker.textContent = t().screens.title.kicker;
      title.textContent = t().lore.title;
      pitch.textContent = t().lore.pitch;
    });

    const play = document.createElement('button');

    play.type = 'button';
    play.className = 'button-primary title-play';
    labels.push(() => play.replaceChildren(uiIcon('play', 26), resume ? t().screens.title.resume : t().screens.title.play));
    play.addEventListener('click', () => {
      this.root.dataset['leaving'] = 'true';
      window.setTimeout(() => this.root.remove(), 380);
      this.unsubscribe();
      onPlay();
    });

    const controls = document.createElement('ul');

    controls.className = 'title-controls';
    for (const [icon, label] of [
      [uiIcon('move', 28), 'move'],
      [itemIcon('wood', 28), 'harvest'],
      [buildingIcon('townHall', 28), 'deliver'],
    ] as const) {
      const item = document.createElement('li');
      const text = document.createTextNode('');

      icon.alt = '';
      icon.removeAttribute('title');
      icon.setAttribute('aria-hidden', 'true');
      item.append(icon, text);
      labels.push(() => {
        text.data = t().screens.title.controls[label];
      });
      controls.append(item);
    }

    panel.append(kicker, title, pitch, play);

    if (resume) {
      const confirm = confirmRestart(onRestart, () => {
        confirm.hidden = true;
        panel.hidden = false;
        play.focus();
      });
      const fresh = document.createElement('button');

      confirm.hidden = true;
      fresh.type = 'button';
      fresh.className = 'button-secondary title-new';
      labels.push(() => fresh.replaceChildren(uiIcon('restart', 22), t().screens.title.newGame));
      fresh.addEventListener('click', () => {
        panel.hidden = true;
        confirm.hidden = false;
        confirm.querySelector<HTMLButtonElement>('.button-secondary')?.focus();
      });
      panel.append(fresh);
      this.root.append(confirm);
    }

    const gardenButton = document.createElement('button');
    let seeds = garden.seeds;
    const gardenLabel = (): void => gardenButton.replaceChildren(uiIcon('seed', 22), t().screens.title.garden(seeds));
    const gardenPanel = new GardenPanel(
      garden,
      gardenActions,
      (current) => {
        seeds = current.seeds;
        gardenLabel();
        gardenButton.dataset['pure'] = String(current.pure);
      },
      () => {
        gardenPanel.root.hidden = true;
        panel.hidden = false;
        gardenButton.focus();
      },
    );

    gardenPanel.root.hidden = true;
    gardenButton.type = 'button';
    gardenButton.className = 'button-secondary title-garden';
    labels.push(() => {
      gardenLabel();
      gardenButton.setAttribute('aria-label', t().screens.title.gardenLabel);
    });
    gardenButton.addEventListener('click', () => {
      panel.hidden = true;
      gardenPanel.root.hidden = false;
      gardenPanel.root.querySelector<HTMLButtonElement>('.button-secondary')?.focus();
    });
    panel.append(gardenButton);
    this.root.append(gardenPanel.root);

    const collectionButton = document.createElement('button');
    const collectionPanel = new CollectionPanel(collection, () => {
      collectionPanel.root.hidden = true;
      panel.hidden = false;
      collectionButton.focus();
    });
    const collectionLabel = (): void => {
      const { done, total } = progressOf(collection());

      collectionButton.replaceChildren(uiIcon('trophy', 22), t().collection.button(done, total));
      collectionButton.setAttribute('aria-label', t().collection.buttonLabel);
    };

    collectionPanel.root.hidden = true;
    collectionButton.type = 'button';
    collectionButton.className = 'button-secondary title-garden';
    labels.push(collectionLabel);
    collectionButton.addEventListener('click', () => {
      collectionPanel.render();
      panel.hidden = true;
      collectionPanel.root.hidden = false;
      collectionPanel.root.querySelector<HTMLButtonElement>('.button-secondary')?.focus();
    });
    panel.append(collectionButton);
    this.root.append(collectionPanel.root);

    if (record > 0) {
      const best = document.createElement('p');
      const icon = buildingIcon('antenna', 22);

      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');
      best.className = 'title-record';
      labels.push(() => best.replaceChildren(icon, t().screens.title.record(record)));
      panel.append(best);
    }

    if (notice) {
      const line = document.createElement('p');

      line.className = 'title-notice';
      labels.push(() => {
        line.textContent = notice();
      });
      panel.append(line);
    }

    panel.append(controls);
    this.root.prepend(panel);
    this.root.append(settings);
    this.unsubscribe = onLocale(() => {
      for (const label of labels) label();
    });

    // « Continuer » est le choix par défaut : Entrée ou Espace le prennent.
    window.setTimeout(() => play.focus(), 0);
  }
}

export class PauseScreen {
  public readonly root: HTMLElement;

  private readonly panel: HTMLElement;
  private readonly confirm: HTMLElement;
  private readonly collection: CollectionPanel;

  public constructor(seed: number, collection: () => Collection, onResume: () => void, onRestart: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'overlay pause-screen';
    this.root.hidden = true;

    this.panel = document.createElement('div');
    this.panel.className = 'panel overlay-panel';

    const title = document.createElement('h2');

    title.className = 'overlay-title';

    const text = document.createElement('p');

    text.className = 'overlay-text';

    const resume = document.createElement('button');

    resume.type = 'button';
    resume.className = 'button-primary';
    resume.addEventListener('click', onResume);

    const restart = document.createElement('button');

    restart.type = 'button';
    restart.className = 'button-secondary';
    restart.addEventListener('click', () => this.asking(true));

    const showCollection = document.createElement('button');

    showCollection.type = 'button';
    showCollection.className = 'button-secondary';
    showCollection.addEventListener('click', () => {
      this.collection.render();
      this.asking(false);
      this.panel.hidden = true;
      this.collection.root.hidden = false;
      this.collection.root.querySelector<HTMLButtonElement>('.button-secondary')?.focus();
    });
    this.collection = new CollectionPanel(collection, () => {
      this.collection.root.hidden = true;
      this.panel.hidden = false;
      showCollection.focus();
    });

    onLocale(() => {
      const { pause } = t().screens;

      showCollection.replaceChildren(uiIcon('trophy', 22), t().collection.title);

      title.textContent = pause.title;
      text.textContent = pause.text;
      resume.textContent = pause.resume;
      restart.replaceChildren(uiIcon('restart', 22), pause.restart);
    });

    this.confirm = confirmRestart(onRestart, () => this.asking(false));
    this.panel.append(title, text, resume, showCollection, restart, seedLine(seed));
    this.root.append(this.panel, this.confirm, this.collection.root);
    this.collection.root.hidden = true;
    this.asking(false);
  }

  public set visible(visible: boolean) {
    this.root.hidden = !visible;
    // Rouvrir la pause, c'est retrouver la pause, pas une question laissée en plan.
    if (visible) {
      this.collection.root.hidden = true;
      this.asking(false);
    }
  }

  private asking(asking: boolean): void {
    this.panel.hidden = asking;
    this.confirm.hidden = !asking;
    if (asking) this.confirm.querySelector<HTMLButtonElement>('.button-secondary')?.focus();
  }
}

/**
 * « Ta colonie sera perdue » : la question avant d'effacer la partie. Le
 * bouton corail recommence, le blanc annule — et c'est lui qui a le focus,
 * pour qu'un Entrée distrait ne coûte pas une colonie.
 */
function confirmRestart(onConfirm: () => void, onCancel: () => void): HTMLElement {
  const panel = document.createElement('div');

  panel.className = 'panel overlay-panel confirm-panel';
  panel.setAttribute('role', 'alertdialog');

  const title = document.createElement('h2');

  title.className = 'overlay-title';

  const text = document.createElement('p');

  text.className = 'overlay-text';

  const confirm = document.createElement('button');

  confirm.type = 'button';
  confirm.className = 'button-primary';
  confirm.addEventListener('click', onConfirm);

  const cancel = document.createElement('button');

  cancel.type = 'button';
  cancel.className = 'button-secondary';
  cancel.addEventListener('click', onCancel);

  onLocale(() => {
    const question = t().screens.confirmRestart;

    title.textContent = question.title;
    text.textContent = question.text;
    confirm.replaceChildren(uiIcon('restartLight', 22), question.confirm);
    cancel.textContent = t().common.cancel;
  });

  panel.append(title, text, confirm, cancel);
  return panel;
}
