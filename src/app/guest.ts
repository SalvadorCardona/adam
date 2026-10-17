/**
 * L'ami qui arrive par `?play=CODE` : il entre dans la partie de l'hôte.
 */
import type { AccountClient } from '../net/account.ts';
import type { Connection } from '../net/connection.ts';
import { playUrl, resyncsOf, titleUrl } from '../net/invite.ts';
import type { GuestSession, GuestStatus } from '../net/play.ts';
import type { World } from '../sim/world.ts';
import type { PlayScreen } from '../ui/playScreen.ts';

/** Les recalages d'affilée sur une image neuve avant de renoncer : au-delà, les deux jeux ne s'accordent pas. */
const MAX_RESYNCS = 3;
/** Une connexion perdue en jeu : la page se rouvre dans la partie après ce délai. */
const RECONNECT_MS = 2000;
/** Le temps de jeu après lequel les recalages passés sont oubliés. */
const RESYNC_FORGET_MS = 30_000;

/**
 * L'ami entre dans la partie de l'hôte : l'écran de connexion d'abord, puis,
 * l'image de l'hôte arrivée, son monde. `null` : il n'entrera pas — l'écran
 * dit pourquoi et rend la main à l'écran titre. Ensuite, l'écran revient si
 * l'hôte part, si la session se ferme ; la connexion perdue ou une
 * divergence rouvrent la page, qui se reconnecte et reçoit une image neuve.
 */
export async function joinAsGuest(
  code: string,
  connection: Connection,
  accounts: AccountClient,
  mount: HTMLElement,
): Promise<{ world: World; session: GuestSession; screen: PlayScreen } | null> {
  // Le jeu à deux n'est lu que par l'ami qui arrive par `?play=`.
  const [{ GuestSession }, { PlayScreen }] = await Promise.all([import('../net/play.ts'), import('../ui/playScreen.ts')]);
  const reopen = (resync = 0): void => window.location.replace(playUrl(window.location.href, code, resync));
  const screen = new PlayScreen(
    () => reopen(),
    () => window.location.replace(titleUrl(window.location.href)),
  );

  mount.append(screen.root);

  const token = accounts.token;

  if (connection.baseUrl === null || token === null) {
    screen.show({ kind: 'failed', reason: connection.baseUrl === null ? 'offline' : 'signedOut' });
    return null;
  }

  return new Promise((resolve) => {
    let playing = false;
    const session = new GuestSession(connection.baseUrl!, code, token, (status: GuestStatus) => {
      switch (status.kind) {
        case 'connecting':
        case 'waiting':
          screen.show(status.kind === 'waiting' ? { kind: 'waiting', host: status.host, hostOnline: status.hostOnline } : status);
          break;
        case 'playing':
          playing = true;
          screen.show(null);
          setTimeout(() => {
            if (resyncsOf(window.location.search) > 0) window.history.replaceState(null, '', playUrl(window.location.href, code));
          }, RESYNC_FORGET_MS);
          resolve({ world: status.world, session, screen });
          break;
        case 'hostLeft':
          screen.show({ kind: 'hostLeft', host: status.host });
          break;
        case 'hostBack':
          reopen();
          break;
        case 'ended':
          screen.show({ kind: 'ended' });
          if (!playing) resolve(null);
          break;
        case 'lost':
          if (!playing) {
            screen.show({ kind: 'failed', reason: 'offline' });
            resolve(null);
            break;
          }
          screen.show({ kind: 'lost' });
          setTimeout(() => reopen(), RECONNECT_MS);
          break;
        case 'failed':
          screen.show({ kind: 'failed', reason: status.reason });
          if (!playing) resolve(null);
          break;
        case 'desync': {
          const done = resyncsOf(window.location.search);

          session.stop();
          if (done >= MAX_RESYNCS) {
            screen.show({ kind: 'failed', reason: 'desync' });
            break;
          }
          screen.show({ kind: 'resync' });
          reopen(done + 1);
          break;
        }
      }
    });

    session.start();
  });
}
