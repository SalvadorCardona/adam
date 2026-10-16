import type { Messages } from '../messages.ts';

export const voice: Messages['voice'] = {
  join: 'Join voice chat',
  leave: 'Leave voice chat',
  title: 'Voice chat',
  joining: 'Waiting for microphone access…',
  micOn: 'Microphone on',
  micOff: 'Microphone muted',
  mute: 'Mute microphone',
  unmute: 'Unmute microphone',
  volume: 'Other players’ volume',
  you: 'You',
  empty: 'Nobody else is in the voice chat yet.',
  note: 'Sound goes straight between your browsers, never through our server.',
  peer: { connecting: 'connecting…', connected: 'connected', failed: 'connection failed', muted: 'muted', speaking: 'speaking' },
  button: { off: 'Join voice chat', on: 'Voice chat', muted: 'Voice chat — muted' },
  toast: {
    joined: 'You joined the voice chat',
    left: 'You left the voice chat',
    muted: 'Microphone muted',
    unmuted: 'Microphone on',
    unsupported: 'Voice chat is not available in this browser (it needs a secure page).',
    denied: 'Microphone blocked: allow it in your browser settings, then try again.',
    noMic: 'No microphone found: plug one in, then try again.',
    micFailed: 'The microphone will not open: another app may be using it.',
    peer: (nickname: string): string => `Could not set up voice chat with ${nickname}.`,
  },
};
