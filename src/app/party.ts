/**
 * Le jeu à plusieurs : le compte, l'invitation d'un ami et la session de
 * l'hôte, l'écran « Rejoindre » d'un lien d'invitation, et le vocal. Sans
 * serveur, rien de tout cela ne fait de requête.
 */
import { t } from '../i18n/locale.ts';
import { inviteCodeOf, playUrl, withoutInvite } from '../net/invite.ts';
import type { GuestSession, HostSession } from '../net/play.ts';
import { PartyClient } from '../net/party.ts';
import { AccountPanel } from '../ui/accountPanel.ts';
import type { Disposer } from '../ui/disposer.ts';
import type { InvitePanel } from '../ui/invitePanel.ts';
import type { JoinPanel } from '../ui/joinPanel.ts';
import { LazyPanel } from '../ui/lazyPanel.ts';
import { VoicePanel } from '../ui/voicePanel.ts';
import type { Boot } from './boot.ts';

/** L'ami entré, la fenêtre d'invitation le montre ce temps-là avant de rendre la partie à l'hôte. */
const WELCOME_MS = 1500;

/** Ce que le jeu à plusieurs attend du reste de l'interface, montée après lui. */
export interface PartyHooks {
  readonly notify: ConstructorParameters<typeof VoicePanel>[0];
  /** Le bouton du vocal change d'état : la pause le suit, « Inviter un ami » lui cède sa place. */
  readonly voiceShown: ConstructorParameters<typeof VoicePanel>[1];
  /** L'ami est entré et la fenêtre d'invitation s'est retirée : la partie reprend. */
  welcomed(): void;
}

export interface Party {
  readonly accountPanel: AccountPanel;
  readonly voicePanel: VoicePanel;
  readonly invitePanel: LazyPanel<InvitePanel>;
  readonly joinPanel: JoinPanel | null;
  /** Branche le vocal sur une session à deux. */
  attachVoice(session: HostSession | GuestSession): Promise<void>;
  /** Après chaque tick chez l'hôte : les pas partent à l'ami. */
  afterTick(): void;
}

export async function wireParty(life: Disposer, boot: Boot, hooks: PartyHooks): Promise<Party> {
  const { world, scenario, guest, connection, accounts } = boot;
  const accountPanel = new AccountPanel(accounts, connection);

  life.add(
    connection.subscribe((state) => {
      if (state === 'online') void accounts.refresh();
    }),
  );

  // Héberger sa partie et inviter un ami ; ou, par un lien d'invitation (`?join=`), rejoindre celle d'un ami.
  const parties = new PartyClient(accounts);
  /*
   * L'hôte : dès que son invitation est ouverte, il s'annonce au serveur et
   * l'ami qui entre reçoit la partie (`HostSession`) ; elle continue de se
   * sauvegarder ici, comme en solo.
   */
  let hosting: HostSession | null = null;
  /*
   * Le vocal (`net/voice.ts`) : seulement dans une partie à deux, jamais en solo
   * ni hors ligne — sans session, il n'y a pas de `VoiceChat`, et le micro
   * n'est demandé qu'au clic « Rejoindre le vocal ». Le bouton prend la place
   * de « Inviter un ami » quand l'ami est là.
   */
  const voicePanel = new VoicePanel(hooks.notify, hooks.voiceShown);
  // Le vocal (WebRTC) ne se charge qu'avec une session à deux : jamais en solo.
  const attachVoice = async (session: HostSession | GuestSession): Promise<void> => {
    const id = accounts.user?.id;

    if (id === undefined) return;

    const [{ VoiceChat }, { BrowserVoiceEnv }] = await Promise.all([import('../net/voice.ts'), import('../net/voiceBrowser.ts')]);
    const chat = new VoiceChat(id, new BrowserVoiceEnv(), (data, to) => session.sendVoice(data, to));

    session.voice = chat;
    voicePanel.bind(chat);
  };
  // L'hôte (`net/play.ts`, `net/lockstep.ts`) ne se charge qu'à l'ouverture d'une invitation ; la dernière demande l'emporte.
  let hostRequest = 0;
  const hostParty = (code: string | null): void => {
    if (guest || hosting?.code === code) return;
    hosting?.stop();
    hosting = null;
    voicePanel.bind(null);
    voicePanel.setPartner(false);

    const request = ++hostRequest;
    const token = accounts.token;

    if (code === null || connection.baseUrl === null || token === null) return;

    const baseUrl = connection.baseUrl;

    void import('../net/play.ts').then(({ HostSession }) => {
      if (request !== hostRequest) return;

      const session = new HostSession(world, baseUrl, code, token, (event) => {
        if (hosting !== session) return;
        /*
         * L'ami est dans la salle : la fenêtre le dit un instant, puis se retire
         * et la partie reprend — l'hôte, venu de la pause, n'a rien à faire, et
         * l'ami n'attend pas « qu'il reprenne le jeu ».
         */
        if (event.kind === 'guestIn') voicePanel.setPartner(true);
        if (event.kind === 'guestOut') voicePanel.setPartner(false);
        if (event.kind === 'guestIn') {
          setTimeout(() => {
            invitePanel.close();
            hooks.welcomed();
          }, WELCOME_MS);
          return;
        }
        if (event.kind !== 'ended') return;
        hosting = null;
        voicePanel.bind(null);
        voicePanel.setPartner(false);
        hooks.notify(t().party.play.sessionEnded, 'good');
      });

      hosting = session;
      void attachVoice(session);
      session.start();
    });
  };
  // La fenêtre d'invitation (et son QR code) ne se charge qu'à son ouverture.
  const invitePanel = new LazyPanel(() =>
    import('../ui/invitePanel.ts').then(({ InvitePanel }) => new InvitePanel(parties, accounts, connection, () => accountPanel.show(), hostParty)),
  );
  const inviteCode = scenario || guest ? null : inviteCodeOf(window.location.search);
  const joinPanel =
    inviteCode === null
      ? null
      : new (await import('../ui/joinPanel.ts')).JoinPanel(
          inviteCode,
          parties,
          accounts,
          connection,
          () => accountPanel.show(),
          () => window.history.replaceState(null, '', withoutInvite(window.location.href)),
          // Dans la salle : l'ami entre dans la partie de l'hôte.
          (code) => window.location.replace(playUrl(window.location.href, code)),
        );

  // Connecté depuis l'écran « Rejoindre » : la fenêtre du compte se retire, l'invitation est là.
  life.add(
    accounts.subscribe((user) => {
      if (user && joinPanel?.open) accountPanel.close();
    }),
  );

  return {
    accountPanel,
    voicePanel,
    invitePanel,
    joinPanel,
    attachVoice,
    afterTick: () => hosting?.afterTick(),
  };
}
