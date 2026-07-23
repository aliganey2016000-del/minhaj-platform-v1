/**
 * Jitsi Room — embeds a live video classroom directly in the page via the
 * Jitsi Meet IFrame External API. No API key, no Jitsi account — a room is
 * simply created the moment the first participant joins a given room name.
 *
 * The Jitsi domain is configurable via VITE_JITSI_DOMAIN and defaults to
 * the free public meet.jit.si server. meet.jit.si caps embedded (non-
 * jitsi.org) calls at 5 minutes — fine for trying this out, but a real
 * class needs a self-hosted Jitsi Meet instance. Once one is deployed
 * (e.g. meet.yourdomain.com), set VITE_JITSI_DOMAIN to that host and
 * redeploy the frontend — nothing else in this file needs to change.
 *
 * Each course gets its own room, named deterministically from the course id
 * (see `jitsiRoomName` below) so teachers and students always land in the
 * same room without any link to copy/paste or store.
 */

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiMeetAPI;
  }
}

interface JitsiMeetAPI {
  dispose: () => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
  addEventListener: (event: string, handler: (...args: any[]) => void) => void;
}

const JITSI_DOMAIN = import.meta.env.VITE_JITSI_DOMAIN || 'meet.jit.si';
const SCRIPT_SRC = `https://${JITSI_DOMAIN}/external_api.js`;

/** Deterministic, reasonably unguessable room name for a course's live class. */
export function jitsiRoomName(courseId: string): string {
  return `MinhajEdu-${courseId}`;
}

let scriptLoadPromise: Promise<void> | null = null;

function loadJitsiScript(): Promise<void> {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('jitsi-external-api');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Jitsi script')));
      return;
    }
    const tag = document.createElement('script');
    tag.id = 'jitsi-external-api';
    tag.src = SCRIPT_SRC;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('Failed to load Jitsi script'));
    document.body.appendChild(tag);
  });
  return scriptLoadPromise;
}

interface JitsiRoomProps {
  roomName: string;
  displayName: string;
  /** Teachers join camera+mic on with full moderator controls; students join muted. */
  isModerator: boolean;
  height?: string | number;
  onLeave?: () => void;
}

export function JitsiRoom({ roomName, displayName, isModerator, height = '70vh', onLeave }: JitsiRoomProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiMeetAPI | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    loadJitsiScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.JitsiMeetExternalAPI) return;

        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          userInfo: { displayName },
          configOverwrite: {
            // Jitsi replaced the old `prejoinPageEnabled` flag with
            // `prejoinConfig.enabled` — set both so this skips the "Join
            // meeting" screen regardless of which the deployed meet.jit.si
            // version reads.
            prejoinPageEnabled: false,
            prejoinConfig: { enabled: false },
            disableDeepLinking: true,
            startWithAudioMuted: !isModerator,
            startWithVideoMuted: false,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DEFAULT_REMOTE_DISPLAY_NAME: 'Participant',
            MOBILE_APP_PROMO: false,
          },
        });
        apiRef.current = api;

        api.addEventListener('videoConferenceJoined', () => setLoading(false));
        api.addEventListener('readyToClose', () => onLeave?.());
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load the video classroom. Check your connection and try again.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  if (error) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-8 text-center text-sm text-red-600 dark:text-red-400" style={{ height }}>
        {error}
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden bg-black" style={{ height }}>
      {loading && (
        // A small corner badge, not a full-screen cover — deliberately never
        // obscures the iframe underneath. If the prejoin screen ever shows
        // up anyway (camera/mic permission prompt, a Jitsi version that
        // ignores the skip-prejoin config, etc.), the "Join meeting" button
        // must stay fully visible and clickable, or the call looks stuck on
        // "Joining..." forever with no way to actually join. pointer-events-
        // none is the same belt-and-suspenders guarantee for clicks.
        <div className="absolute top-3 left-3 z-10 pointer-events-none flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-white text-xs">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          Connecting...
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}

export default JitsiRoom;
