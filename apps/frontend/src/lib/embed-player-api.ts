/**
 * Lazy-loaders for the YouTube IFrame Player API and the Vimeo Player SDK.
 * Both let JS attach to an EXISTING <iframe> (no need to let the SDK create
 * its own) and report real playback position via postMessage under the
 * hood — the only way to get "how much of this video did they actually
 * watch" for an embedded video, since a plain <iframe> exposes none of that
 * to the parent page on its own (unlike a native <video> element's
 * timeupdate/pause/ended events, which only fire for self-hosted files).
 *
 * Each loader caches its in-flight promise so multiple lesson videos on the
 * same page don't each inject a duplicate <script> tag.
 */

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementOrId: HTMLElement | string,
        options: { events?: Record<string, (event: any) => void> }
      ) => YouTubePlayer;
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
    Vimeo?: { Player: new (element: HTMLElement) => VimeoPlayer };
  }
}

export interface YouTubePlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
}

export interface VimeoPlayer {
  on: (event: string, cb: (data: any) => void) => void;
  getCurrentTime: () => Promise<number>;
  getDuration: () => Promise<number>;
}

let youtubeApiPromise: Promise<void> | null = null;

export function loadYouTubeApi(): Promise<void> {
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve) => {
    if (window.YT?.Player) { resolve(); return; }
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };
    if (document.getElementById('youtube-iframe-api')) return; // script already injected, just waiting on the callback above
    const tag = document.createElement('script');
    tag.id = 'youtube-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  });
  return youtubeApiPromise;
}

let vimeoApiPromise: Promise<void> | null = null;

export function loadVimeoApi(): Promise<void> {
  if (vimeoApiPromise) return vimeoApiPromise;
  vimeoApiPromise = new Promise((resolve, reject) => {
    if (window.Vimeo?.Player) { resolve(); return; }
    const existing = document.getElementById('vimeo-player-api') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Vimeo Player API')));
      return;
    }
    const tag = document.createElement('script');
    tag.id = 'vimeo-player-api';
    tag.src = 'https://player.vimeo.com/api/player.js';
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error('Failed to load Vimeo Player API'));
    document.head.appendChild(tag);
  });
  return vimeoApiPromise;
}
