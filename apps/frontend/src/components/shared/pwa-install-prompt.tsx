/**
 * PWA Install Prompt
 *
 * Detects when the app can be installed (beforeinstallprompt event fired) and
 * shows a sleek banner encouraging users to install for a better experience.
 *
 * Behavior:
 *   - Banner appears at bottom of screen when install is available
 *   - Dismisses for 7 days if user closes it
 *   - Hides permanently if app is already installed (standalone mode)
 *   - Offers both native install prompt and manual instructions for iOS
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Share2, Smartphone } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isInstalled(): boolean {
  if (typeof window === 'undefined') return true;
  if ((window as any).__pwaInstalled) return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if ((navigator as any).standalone) return true;
  return false;
}

function wasDismissedRecently(): boolean {
  try {
    const ts = localStorage.getItem('pwa_install_dismissed');
    if (!ts) return false;
    const dismissedAt = parseInt(ts, 10);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - dismissedAt < sevenDays;
  } catch {
    return false;
  }
}

function recordDismissed() {
  try {
    localStorage.setItem('pwa_install_dismissed', String(Date.now()));
  } catch { /* localStorage may be unavailable */ }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PwaInstallPrompt() {
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const isIOSDevice = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

  useEffect(() => {
    // Already installed — never show
    if (isInstalled()) return;

    // Already dismissed in last 7 days
    if (wasDismissedRecently()) return;

    // Check if deferred prompt is already available
    if ((window as any).__pwaDeferredPrompt) {
      setDeferredPrompt((window as any).__pwaDeferredPrompt);
      setShowBanner(true);
      return;
    }

    // Listen for the install-ready event
    const handler = (e: CustomEvent) => {
      setDeferredPrompt(e.detail);
      if (!wasDismissedRecently()) {
        setShowBanner(true);
      }
    };

    window.addEventListener('pwa-install-ready', handler as EventListener);

    // For iOS: no beforeinstallprompt, show guide after 30 seconds on site
    if (isIOSDevice && !isInstalled()) {
      const timer = setTimeout(() => {
        if (!wasDismissedRecently()) {
          setShowBanner(true);
        }
      }, 30000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('pwa-install-ready', handler as EventListener);
      };
    }

    return () => {
      window.removeEventListener('pwa-install-ready', handler as EventListener);
    };
  }, []);

  // Listen for appinstalled
  useEffect(() => {
    const handler = () => setShowBanner(false);
    window.addEventListener('pwa-installed', handler);
    window.addEventListener('appinstalled', handler);
    return () => {
      window.removeEventListener('pwa-installed', handler);
      window.removeEventListener('appinstalled', handler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else if (isIOSDevice) {
      setShowIOSGuide(true);
    }
  }, [deferredPrompt, isIOSDevice]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    setShowIOSGuide(false);
    recordDismissed();
  }, []);

  return (
    <>
      {/* ── Install Banner ── */}
      <AnimatePresence>
        {showBanner && !showIOSGuide && (
          <motion.div
            initial={{ y: 150, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 150, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-4 start-4 end-4 z-[100] sm:bottom-6 sm:start-auto sm:end-6 sm:max-w-md"
          >
            <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-2xl">
              {/* Accent bar */}
              <div className="absolute top-0 start-0 end-0 h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500" />

              <div className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  {/* App icon */}
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-500/25">
                    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2L2 7v5.5c0 5.05 4.29 9.5 10 11 5.71-1.5 10-5.95 10-11V7l-10-5z" />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-[var(--color-text-primary)]">
                      {isIOSDevice
                        ? 'Install for a better experience'
                        : 'Install Al-Rahma LMS'}
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                      {isIOSDevice
                        ? 'Add to your Home Screen for quick access'
                        : 'Get quick access and offline support'}
                    </p>
                  </div>

                  {/* Close button */}
                  <button
                    onClick={handleDismiss}
                    className="flex-shrink-0 p-1 rounded-lg text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={handleInstall}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 hover:from-emerald-600 hover:to-emerald-700 transition-all active:scale-[0.98]"
                  >
                    {isIOSDevice ? (
                      <>
                        <Share2 className="h-4 w-4" />
                        Share &rarr; Add to Home Screen
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Install App
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="flex-shrink-0 rounded-xl px-3 py-2.5 text-xs font-medium text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── iOS Install Guide Overlay ── */}
      <AnimatePresence>
        {showIOSGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end justify-center p-4"
            onClick={handleDismiss}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--color-surface-primary)] rounded-2xl p-6 max-w-sm w-full mb-4 shadow-2xl"
            >
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-lg">
                  <Smartphone className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">
                  Add to Home Screen
                </h3>
                <div className="text-sm text-[var(--color-text-secondary)] space-y-3 text-left">
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-sm font-bold text-[var(--color-text-primary)]">1</span>
                    <p>Tap the <strong className="text-blue-600">Share</strong> button <Share2 className="h-3.5 w-3.5 inline text-blue-600" /> in Safari's toolbar</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-sm font-bold text-[var(--color-text-primary)]">2</span>
                    <p>Scroll down and tap <strong className="text-blue-600">"Add to Home Screen"</strong></p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-surface-tertiary)] text-sm font-bold text-[var(--color-text-primary)]">3</span>
                    <p>Tap <strong className="text-blue-600">"Add"</strong> in the top right corner</p>
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  className="mt-5 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default PwaInstallPrompt;