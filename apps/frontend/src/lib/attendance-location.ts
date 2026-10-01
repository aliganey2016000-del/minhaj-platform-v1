export type AttendanceLocation = { latitude: number; longitude: number; accuracy: number };

/** Wait for a fresh precise fix; never replace an existing school location with an unreliable fix. */
export function getAttendanceLocation(maxAccuracy = 100, signal?: AbortSignal): Promise<AttendanceLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser does not support GPS location.'));
    let watch: number | undefined;
    let finished = false;
    let best: GeolocationPosition | undefined;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      signal?.removeEventListener('abort', abort);
      if (error) return reject(error);
      if (!best) return reject(new Error('GPS could not be read. Enable precise location and try near a window or outside.'));
      if (best.coords.accuracy > maxAccuracy) return reject(new Error(
        'GPS accuracy is ±' + Math.round(best.coords.accuracy) + ' m; required accuracy is ±' + maxAccuracy + ' m. Enable precise location and try near a window or outside.'
      ));
      resolve({ latitude: best.coords.latitude, longitude: best.coords.longitude, accuracy: best.coords.accuracy });
    };
    const abort = () => finish(new Error('Verification cancelled.'));
    const timer = window.setTimeout(() => finish(), 20000);
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    watch = navigator.geolocation.watchPosition(position => {
      if (finished || Date.now() - position.timestamp > 15000) return;
      const { latitude, longitude, accuracy } = position.coords;
      if (![latitude, longitude, accuracy].every(Number.isFinite) || accuracy < 0) return;
      if (!best || accuracy < best.coords.accuracy) best = position;
      if (accuracy <= Math.min(30, maxAccuracy)) finish();
    }, error => {
      if (error.code === 1) finish(new Error('Location permission is blocked. Allow precise location for this site and try again.'));
    }, { enableHighAccuracy: true, timeout: 18000, maximumAge: 0 });
    if (finished) navigator.geolocation.clearWatch(watch);
  });
}
