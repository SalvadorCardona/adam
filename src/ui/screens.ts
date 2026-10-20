/**
 * Écrans plein cadre : l'écran titre et la pause.
 *
 * L'écran titre n'est pas décoratif. Sur mobile, le son ne peut démarrer
 * qu'après un geste : le bouton « Jouer » est ce geste, et la partie ne
 * commence qu'à ce moment-là — le joueur n'arrive pas au milieu d'une
 * simulation déjà lancée. C'est une scène, pas une page : un tableau vivant
 * en plans de profondeur (`TitleArt`, `ui/titleArt.ts`), le logo dessiné
 * (`titleLogo`), l'histoire en deux phrases — le (i) la déplie. Le panneau
 * reste au premier plan, immobile : seule la scène bouge derrière lui.
 *
 * Quand une partie est sauvegardée, l'écran titre propose « Continuer » (le
 * choix par défaut), une carte qui dit où en est la partie — « Jour 5 ·
 * 9 colons · Chapitre 2 · il y a 3 h », lu par `peekSave` sans charger le
 * monde —, et « Nouvelle partie ». Recommencer efface la colonie : les deux
 * écrans le font confirmer avant. Les trois gestes du jeu ne s'affichent
 * qu'avant la toute première partie (`LocalPlayed`).
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

import { titleLogo } from '../art/brand.ts';
import type { DailyModId } from '../data/dailyMods.ts';
import { CHAPTERS } from '../data/objectives.ts';
import { onLocale, t } from '../i18n/locale.ts';
import { reducedMotion } from '../render/motion.ts';
import { progressOf, type Collection } from '../sim/collection.ts';
import type { Garden } from '../sim/garden.ts';
import type { SaveSummary } from '../sim/save.ts';
import { CollectionPanel } from './collectionPanel.ts';
import { GardenPanel, type GardenActions } from './garden.ts';
import { buildingIcon, itemIcon, uiIcon } from './icons.ts';
import { seedLine } from './seed.ts';
import { TITLE_DIVE_MS, TitleArt, type TitleSound } from './titleArt.ts';

export interface TitleOptions {
  /** Une partie sauvegardée attend : « Continuer » et « Nouvelle partie » remplacent « Jouer ». */
  resume: boolean;
  /** Ce que la carte « Continuer » dit de cette partie — jour, colons, chapitre, depuis quand ; `null` s'il ne se lit pas. */
  summary: SaveSummary | null;
  /** Aucune partie n'a encore été lancée sur l'appareil : l'écran rappelle les trois gestes du jeu. */
  firstRun: boolean;
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
  /**
   * La carte du jour : `date` et `mod` sont ceux du jour affiché, `best` le meilleur score de cette date,
   * `playing` si la page est déjà la partie du jour, `open` l'ouvre (ou, `playing`, revient à la partie principale).
   */
  daily: { date: string; mod: DailyModId; best: number; playing: boolean; open: () => void };
  /** La collection de succès : l'écran titre l'ouvre. */
  collection: () => Collection;
  /** L'engrenage du coin : le menu des réglages, la langue d'abord. */
  onSettings: () => void;
  /** Le son de la scène : ambiance, fleurs, mutant, oiseaux. */
  sound: TitleSound;
  /** Le bouton « Compte » (`AccountPanel.button`) : facultatif, on joue sans. */
  accountButton: HTMLButtonElement;
}

export class TitleScreen {
  public readonly root: HTMLElement;
  private readonly unsubscribe: () => void;

  public constructor({ resume, summary, firstRun, notice, onPlay, onRestart, garden, gardenActions, record, daily, collection, onSettings, accountButton, sound }: TitleOptions) {
    this.root = document.createElement('div');
    this.root.className = 'overlay title-screen';
    const art = new TitleArt(sound);

    this.root.append(art.root);

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

    // Le logo dessiné, pas une police : le titre de la page reste lisible par son `alt`.
    const title = document.createElement('h1');
    const logo = document.createElement('img');

    title.className = 'title-logo';
    logo.src = svgUrl(titleLogo());
    logo.draggable = false;
    title.append(logo);

    // L'histoire en deux phrases ; le (i) la déplie en entier, et la replie.
    const story = document.createElement('div');
    const pitch = document.createElement('p');
    const more = document.createElement('button');
    let unfolded = false;
    const tellStory = (): void => {
      const text = t();

      pitch.textContent = unfolded ? text.lore.pitch : text.lore.tagline;
      more.setAttribute('aria-label', unfolded ? text.screens.title.storyLess : text.screens.title.story);
      more.setAttribute('aria-expanded', String(unfolded));
    };

    story.className = 'title-story';
    pitch.className = 'title-pitch';
    more.type = 'button';
    more.className = 'title-more';
    more.append(uiIcon('info', 20));
    more.addEventListener('click', () => {
      unfolded = !unfolded;
      tellStory();
    });
    story.append(pitch, more);
    labels.push(() => {
      logo.alt = t().lore.title;
      tellStory();
    });

    // « Jouer », ou la carte de sauvegarde : « Continuer » et où en est la partie, sa vignette devant.
    const play = document.createElement('button');

    play.type = 'button';
    play.className = resume ? 'button-primary title-play title-save' : 'button-primary title-play';
    labels.push(() => play.replaceChildren(...(resume ? saveCard(summary) : [uiIcon('play', 26), t().screens.title.play])));
    // Survolé ou visé, « Jouer » fait se retourner Adam ; pressé, la caméra plonge vers la mairie avant de laisser la place au jeu.
    play.addEventListener('pointerenter', () => art.ready(true));
    play.addEventListener('pointerleave', () => art.ready(false));
    // Au clavier ou à la manette, le focus vaut le survol — pas celui que l'écran pose seul à l'ouverture.
    play.addEventListener('focus', () => art.ready(play.matches(':focus-visible') && document.hasFocus() && opened));
    play.addEventListener('blur', () => art.ready(false));
    play.addEventListener('click', () => {
      this.root.dataset['leaving'] = 'true';
      art.dive();
      window.setTimeout(() => {
        art.dispose();
        this.root.remove();
      }, reducedMotion() ? 380 : TITLE_DIVE_MS);
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

    // Les boutons secondaires, deux par rangée : tout tient sans défiler sur un téléphone.
    const extras = document.createElement('div');

    extras.className = 'title-extras';
    panel.append(title, story, play);

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
      gardenPanel.root.scrollTop = 0;
      gardenPanel.root.querySelector<HTMLButtonElement>('.button-secondary')?.focus({ preventScroll: true });
    });
    extras.append(gardenButton);
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
      collectionPanel.root.scrollTop = 0;
      collectionPanel.root.querySelector<HTMLButtonElement>('.button-secondary')?.focus({ preventScroll: true });
    });
    extras.append(collectionButton);
    this.root.append(collectionPanel.root);

    extras.append(accountButton);

    const dailyButton = document.createElement('button');

    dailyButton.type = 'button';
    dailyButton.className = 'button-secondary title-garden';
    labels.push(() => dailyButton.replaceChildren(uiIcon('play', 22), daily.playing ? t().screens.daily.back : t().screens.daily.button));
    dailyButton.addEventListener('click', daily.open);
    extras.append(dailyButton);
    panel.append(extras);

    if (daily.playing) {
      const line = document.createElement('p');

      line.className = 'title-notice';
      labels.push(() => {
        const mod = t().screens.daily.mods[daily.mod];

        line.textContent = `${t().screens.daily.today(daily.date)} — ${mod.name} : ${mod.text}`;
      });
      panel.append(line);
    }

    if (daily.best > 0) {
      const best = document.createElement('p');

      best.className = 'title-record';
      labels.push(() => {
        best.textContent = t().screens.daily.best(daily.best);
      });
      panel.append(best);
    }

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

    // Les trois gestes du jeu, avant la toute première partie seulement.
    if (firstRun && !resume) panel.append(controls);
    this.root.append(panel);
    this.root.append(settings);
    this.unsubscribe = onLocale(() => {
      for (const label of labels) label();
    });

    // « Continuer » est le choix par défaut : Entrée ou Espace le prennent.
    let opened = false;

    window.setTimeout(() => {
      play.focus();
      opened = true;
    }, 0);
  }
}

/** Un SVG en `data:` URL, pour un `<img>`. */
function svgUrl(source: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

/**
 * Le contenu de la carte « Continuer » : la vignette du chapitre en cours, le
 * mot, puis « Jour 5 · 9 colons · Chapitre 2 · il y a 3 h ». Sans résumé
 * lisible, la carte dit seulement « Continuer ».
 */
function saveCard(summary: SaveSummary | null): HTMLElement[] {
  const text = t().screens.title;
  const label = document.createElement('span');

  label.className = 'title-save-label';
  label.textContent = text.resume;
  if (!summary) return [uiIcon('play', 26), label];

  const chapter = CHAPTERS[summary.chapter];
  const thumb = buildingIcon(chapter?.icon ?? 'antenna', 44);
  const body = document.createElement('span');
  const line = document.createElement('span');
  const minutes = Math.max(0, Math.floor((Date.now() - summary.savedAt) / 60_000));
  const parts = [
    text.save.day(summary.day),
    ...(summary.colonists === null ? [] : [text.save.colonists(summary.colonists)]),
    chapter ? text.save.chapter(summary.chapter + 1) : text.save.afterSignal,
    ...(summary.savedAt > 0 ? [text.save.ago(minutes)] : []),
  ];

  thumb.alt = '';
  thumb.setAttribute('aria-hidden', 'true');
  thumb.classList.add('title-save-thumb');
  body.className = 'title-save-body';
  line.className = 'title-save-line';
  line.textContent = parts.join(' · ');
  body.append(label, line);
  return [thumb, body];
}

export class PauseScreen {
  public readonly root: HTMLElement;

  private readonly panel: HTMLElement;
  private readonly confirm: HTMLElement;
  private readonly collection: CollectionPanel;
  private readonly voice: HTMLButtonElement;
  private voiceOn = false;

  /** `onInvite` : `null` chez l’ami en jeu et sans serveur — le bouton n’existe alors pas. */
  public constructor(seed: number, collection: () => Collection, onResume: () => void, onRestart: () => void, onInvite: (() => void) | null, onVoice: (() => void) | null = null, onSettings: () => void = () => {}, onTitle: (() => void) | null = null) {
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
    restart.className = 'button-secondary pause-restart';
    restart.addEventListener('click', () => this.asking(true));

    // Les réglages s'ouvrent par-dessus la pause, qui reste derrière.
    const settings = document.createElement('button');

    settings.type = 'button';
    settings.className = 'button-secondary';
    settings.addEventListener('click', onSettings);

    // L'écran titre : la partie est écrite avant (`onTitle`), « Continuer » la reprend.
    const toTitle = document.createElement('button');

    toTitle.type = 'button';
    toTitle.className = 'button-secondary';
    if (onTitle) toTitle.addEventListener('click', onTitle);

    const invite = document.createElement('button');

    invite.type = 'button';
    invite.className = 'button-secondary';
    if (onInvite) invite.addEventListener('click', onInvite);

    // Le vocal : caché hors d'une partie à deux (`setVoice`) ; rejoindre ou quitter, selon l'état.
    this.voice = document.createElement('button');
    this.voice.type = 'button';
    this.voice.className = 'button-secondary pause-voice';
    this.voice.hidden = true;
    this.voice.addEventListener('click', () => onVoice?.());

    const showCollection = document.createElement('button');

    showCollection.type = 'button';
    showCollection.className = 'button-secondary';
    showCollection.addEventListener('click', () => {
      this.collection.render();
      this.asking(false);
      this.panel.hidden = true;
      this.collection.root.hidden = false;
      this.collection.root.scrollTop = 0;
      this.collection.root.querySelector<HTMLButtonElement>('.button-secondary')?.focus({ preventScroll: true });
    });
    this.collection = new CollectionPanel(collection, () => {
      this.collection.root.hidden = true;
      this.panel.hidden = false;
      showCollection.focus();
    });

    onLocale(() => {
      const { pause } = t().screens;

      showCollection.replaceChildren(uiIcon('trophy', 22), t().collection.title);
      settings.replaceChildren(uiIcon('settings', 22), pause.settings);
      toTitle.replaceChildren(uiIcon('home', 22), pause.titleScreen);
      invite.replaceChildren(uiIcon('invite', 22), t().party.invite);
      this.renderVoice();

      title.textContent = pause.title;
      text.textContent = pause.text;
      resume.textContent = pause.resume;
      restart.replaceChildren(uiIcon('restart', 22), pause.restart);
    });

    this.confirm = confirmRestart(onRestart, () => this.asking(false));
    this.panel.append(title, text, resume, settings, showCollection, ...(onInvite ? [invite] : []), this.voice, ...(onTitle ? [toTitle] : []), restart, seedLine(seed));
    this.root.append(this.panel, this.confirm, this.collection.root);
    this.collection.root.hidden = true;
    this.asking(false);
  }

  /** Le bouton du vocal : caché, « Rejoindre le vocal » (`off`) ou « Quitter le vocal » (`on`). */
  public setVoice(state: 'hidden' | 'off' | 'on'): void {
    this.voice.hidden = state === 'hidden';
    this.voiceOn = state === 'on';
    this.renderVoice();
  }

  private renderVoice(): void {
    this.voice.replaceChildren(uiIcon(this.voiceOn ? 'micOff' : 'mic', 22), this.voiceOn ? t().voice.leave : t().voice.join);
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
