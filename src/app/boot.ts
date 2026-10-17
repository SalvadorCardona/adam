/**
 * Le démarrage : la langue, la partie à jouer (sauvegarde, carte du jour,
 * partie de test, ou celle de l'hôte chez l'ami) et ce qui la lit et l'écrit.
 * Rien n'est encore à l'écran, sauf l'écran de connexion de l'ami.
 */
import { TEST_SCENARIOS } from '../data/testScenario.ts';
import { assertPrototypes } from '../data/validate.ts';
import { prefetchMusic } from '../audio/music.ts';
import { detectLocale, loadLocale, onLocale, setLocale, t } from '../i18n/locale.ts';
import { AccountClient } from '../net/account.ts';
import { Connection } from '../net/connection.ts';
import { playCodeOf } from '../net/invite.ts';
import type { GuestSession } from '../net/play.ts';
import { dailyGame, dailySeed } from '../sim/daily.ts';
import { awayMs } from '../sim/offline.ts';
import { World } from '../sim/world.ts';
import { LocalAccount } from '../storage/localAccount.ts';
import { adoptLegacyData } from '../storage/legacyKeys.ts';
import { LocalLocale } from '../storage/localLocale.ts';
import { DAILY_SAVE_KEY, LocalSave, type LoadResult } from '../storage/localSave.ts';
import { TabLock } from '../storage/localTab.ts';
import { installCursors } from '../ui/cursors.ts';
import { parseDailyDate } from '../ui/dailyMap.ts';
import type { PlayScreen } from '../ui/playScreen.ts';
import { formatSeed, parseSeed } from '../ui/seed.ts';
import { testScenarioOf } from '../ui/testRoute.ts';
import { joinAsGuest } from './guest.ts';

/** Ce que le démarrage laisse au câblage. */
export interface Boot {
  readonly mount: HTMLDivElement;
  readonly world: World;
  /** La partie de test ouverte (`…/test/<id>`), ou `null`. */
  readonly scenario: ReturnType<typeof testScenarioOf>;
  /** L'ami d'une partie à deux : la session de l'hôte et son écran de connexion. */
  readonly guest: { world: World; session: GuestSession; screen: PlayScreen } | null;
  /** Partie de test ou partie d'un autre : rien ne se lit ni ne s'écrit sur l'appareil. */
  readonly sandbox: boolean;
  readonly connection: Connection;
  readonly accounts: AccountClient;
  readonly localePrefs: LocalLocale;
  readonly saves: LocalSave;
  readonly loaded: LoadResult;
  readonly tabs: TabLock;
}

/** Prépare la partie ; `null` quand l'ami n'entrera pas (son écran dit pourquoi). */
export async function bootGame(): Promise<Boot | null> {
  // les données sont figées au build, et TypeScript a déjà tout vérifié.
  if (import.meta.env.DEV) assertPrototypes();

  // Les curseurs dessinés, sur un appareil à souris seulement.
  installCursors();

  // Les données de l'appareil d'avant le renommage du jeu, avant toute lecture.
  await adoptLegacyData();

  // La langue d'abord : tout ce qui suit s'écrit dans elle. Au premier lancement, celle du navigateur.
  // Lue et écrite même sur la partie de test, comme voulu : la langue est un réglage de l'appareil, pas une donnée de partie.
  const localePrefs = LocalLocale.browser();

  const startLocale = localePrefs.load() ?? detectLocale(navigator.languages ?? [navigator.language]);

  await loadLocale(startLocale);
  setLocale(startLocale);
  onLocale((locale) => {
    document.documentElement.lang = locale;
    document.title = t().common.pageTitle;
  });

  // La musique se télécharge pendant que l'écran titre se monte, sans le retarder.
  prefetchMusic();

  const mount = document.querySelector<HTMLDivElement>('#app');

  if (!mount) throw new Error('#app introuvable');

  /*
   * `…/test` : une base déjà bâtie, rebâtie à chaque chargement. Elle ne lit
   * ni n'écrit aucun stockage — ni la sauvegarde du joueur, ni son jardin,
   * ni son record — et s'ouvre sans écran titre.
   */
  const scenario = testScenarioOf(window.location.pathname, import.meta.env.BASE_URL);

  /*
   * Le back-end, s'il y en a un (`VITE_API_URL`) : une sonde qui ne retarde
   * rien et n'empêche rien. Hors ligne par défaut ; serveur coupé ou absent,
   * le jeu se joue exactement pareil.
   */
  const connection = Connection.browser();

  connection.start();

  // Le compte, facultatif : la session gardée sur l'appareil se revérifie au passage en ligne.
  const accounts = new AccountClient(connection.baseUrl, scenario ? new LocalAccount(null) : LocalAccount.browser());

  /*
   * `?play=CODE` : l'ami joue dans la partie de l'hôte. Son monde est l'image
   * que l'hôte lui envoie, rejouée tick par tick (`net/lockstep.ts`) ; rien
   * n'en est sauvegardé ici — sa propre partie, son jardin, sa collection
   * restent intacts, il les retrouve à l'écran titre.
   */
  const playCode = scenario ? null : playCodeOf(window.location.search);
  const guest = playCode === null ? null : await joinAsGuest(playCode, connection, accounts, mount);

  if (playCode !== null && !guest) return null;

  const sandbox = scenario !== null || guest !== null;

  // Une partie sauvegardée reprend là où elle s'était arrêtée ; sinon, une carte neuve.
  // La carte du jour (`?daily=`) a son emplacement : la partie principale n'est ni lue ni écrite.
  const dailyOf = sandbox ? null : parseDailyDate(window.location.search);
  const saves = sandbox ? new LocalSave(null) : LocalSave.browser(dailyOf === null ? undefined : DAILY_SAVE_KEY);
  let loaded = saves.load();

  // Une partie du jour d'un autre jour n'est plus la carte d'aujourd'hui : elle s'efface.
  if (loaded.status === 'ok' && dailyOf !== null && loaded.world.dailyMap?.date !== dailyOf) {
    saves.clear();
    loaded = { status: 'none' };
  }
  // Cet onglet prend la main sur la sauvegarde ; un onglet plus ancien cesse d'y écrire (`TabLock`).
  const tabs = sandbox ? new TabLock(null) : TabLock.browser();

  tabs.claim();
  const world = guest
    ? guest.world
    : scenario
      ? (await import('../sim/testScenario.ts')).stageScenario(TEST_SCENARIOS[scenario])
      : loaded.status === 'ok'
        ? loaded.world
        : dailyOf !== null
          ? World.newColony(dailySeed(dailyOf), dailyGame(dailyOf))
          : World.newColony(readSeed());

  // L'ami d'une partie à deux sauvegardée n'est plus là : son sac reste au sol, où il l'a laissé.
  if (!guest && world.partner) world.push({ type: 'partnerLeave' });

  // Le joystick repart au repos : un doigt posé au moment où l'onglet s'est fermé ne fait plus marcher Adam.
  if (loaded.status === 'ok') world.push({ type: 'setMoveAxis', x: 0, y: 0 });
  // La ville a vécu pendant que le jeu était fermé : elle rattrape ce temps au premier tick, borné au plafond.
  if (loaded.status === 'ok') world.push({ type: 'catchUp', awayMs: awayMs(loaded.savedAt, Date.now()) });


  return { mount, world, scenario, guest, sandbox, connection, accounts, localePrefs, saves, loaded, tabs };
}

/**
 * Seed depuis `?seed=1234`, sinon aléatoire.
 * Une seed dans l'URL, c'est une carte qu'on peut se repasser telle quelle —
 * indispensable pour reproduire un bug de génération.
 */
function readSeed(): number {
  return parseSeed(window.location.search) ?? (Math.random() * 0xffffffff) >>> 0;
}

/**
 * Un lien partagé mène à une carte, mais une sauvegarde l'emporte : elle
 * reprend sur la sienne. L'écran titre le dit, et « Nouvelle partie » ouvre
 * la carte du lien.
 */
export function linkNotice(world: World): (() => string) | undefined {
  const linked = parseSeed(window.location.search);

  if (linked === null || linked === world.seed) return undefined;
  return () => t().screens.title.linkedMap(formatSeed(linked));
}
