import type { Messages } from '../messages.ts';

/** How long is left, in words: "42 min", "1 min", "less than a minute". */
const remaining = (ms: number): string => {
  const minutes = Math.ceil(ms / 60_000);

  return ms <= 0 ? 'expired' : minutes <= 1 ? 'less than a minute' : `${minutes} min`;
};

export const party: Messages['party'] = {
  invite: 'Invite a friend',
  title: 'Invite a friend',
  joinTitle: 'Join the game',
  intro: 'Share this link or QR code: your friend arrives in the waiting room.',
  offline: 'Server unreachable. The game stays playable; try again later.',
  notConfigured: 'Multiplayer games are not available in this version of the game.',
  signInFirst: 'Sign in to host your game and invite a friend.',
  signInButton: 'Sign in or create an account',
  creating: 'Creating the invitation…',
  retry: 'Try again',
  newInvite: 'New invitation',
  close: 'Close',
  qrAlt: 'Invitation QR code',
  linkLabel: 'Invitation link',
  codeLabel: 'Code',
  share: 'Share',
  copy: 'Copy link',
  copied: 'Link copied!',
  copyFailed: 'Could not copy: select the link and copy it.',
  shareTitle: 'Join my Mobile Factory game',
  shareText: (host) => `${host} invites you to play Mobile Factory.`,
  validFor: (ms) => `Valid for ${remaining(ms)}`,
  room: 'Waiting room',
  waitingForFriend: 'Waiting for a friend…',
  hostLine: (name) => `${name} (host)`,
  joined: (name) => `${name} joined the game`,
  closeSession: 'Close the session',
  sessionClosed: 'The session is closed: the link no longer works.',
  ended: {
    expired: 'The invitation has expired.',
    closed: 'The session is closed.',
  },
  join: {
    title: (host) => `Join ${host}’s game`,
    loading: 'Looking for the game…',
    signInFirst: 'Sign in or create an account to join this game; you will come back here afterwards.',
    signInButton: 'Sign in or create an account',
    button: 'Join',
    joining: 'One moment…',
    waiting: (host) => `You are in ${host}’s waiting room. The game will start soon.`,
    own: 'This is your own invitation: share it from the pause menu, “Invite a friend”.',
    leave: 'Leave the room',
    backToTitle: 'Back to the title screen',
    offline: 'Server unreachable. Try again later.',
    errors: {
      notFound: 'This invitation link is not valid.',
      expired: 'This link has expired. Ask your friend for a new one.',
      closed: 'Your friend closed the session. Ask them for a new link.',
      full: 'This game is already full.',
      server: 'The server answered wrongly. Try again later.',
      tooManyAttempts: (seconds) => `Too many attempts. Try again in ${seconds} s.`,
      unauthorized: 'Session expired: sign in again.',
      forbidden: 'This link does not let you join this game.',
    },
  },
  errors: {
    server: 'The server answered wrongly. Try again later.',
    unauthorized: 'Session expired: sign in again.',
    tooManyAttempts: (seconds) => `Too many attempts. Try again in ${seconds} s.`,
  },
};
