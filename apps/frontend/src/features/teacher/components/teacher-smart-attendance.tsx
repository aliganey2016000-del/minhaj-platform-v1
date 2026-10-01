import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  RotateCcw,
  ScanFace,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import api from '../../../lib/axios';
import { getAttendanceLocation } from '../../../lib/attendance-location';

type VerificationMode = 'enroll' | 'check-in' | 'check-out';

type SmartAttendanceStatus = {
  configured: boolean;
  settings: {
    enabled: boolean;
    radiusMeters: number;
    maxAccuracyMeters: number;
    locationAccuracyMeters?: number;
    requireLiveness: boolean;
    enrollmentRequiresGeofence: boolean;
    checkOutEnabled: boolean;
    timezone: string;
    locationConfigured: boolean;
  };
  biometricEnrolled: boolean;
  biometric?: {
    enrolledAt?: string;
    lastVerifiedAt?: string;
    verificationCount?: number;
  } | null;
  todayAttendance?: {
    _id: string;
    status: string;
    source?: 'admin' | 'smart_self';
    checkInAt?: string;
    checkOutAt?: string;
    verification?: {
      gpsVerified?: boolean;
      faceVerified?: boolean;
      livenessVerified?: boolean;
      distanceMeters?: number;
      accuracyMeters?: number;
      faceDistance?: number;
    };
  } | null;
  canCheckIn: boolean;
  canCheckOut: boolean;
};

type Challenge = {
  token: string;
  actions: Array<'blink' | 'turn_left' | 'turn_right' | 'look_straight'>;
  expiresInSeconds: number;
};

type LivenessMetrics = {
  sampleCount: number;
  durationMs: number;
  blinkScore: number;
  turnScore: number;
  facePresenceRatio: number;
};

let faceApiPromise: Promise<any> | null = null;
let faceModelsPromise: Promise<any> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function loadFaceApiScript(): Promise<any> {
  if ((window as any).faceapi) return Promise.resolve((window as any).faceapi);
  if (faceApiPromise) return faceApiPromise;

  faceApiPromise = new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Face engine download timed out. Please retry.')), 30000);
    const fail = () => { window.clearTimeout(timer); reject(new Error('Face verification engine failed to load.')); };
    const finish = () => {
      window.clearTimeout(timer);
      const loaded = (window as any).faceapi;
      if (loaded) resolve(loaded);
      else reject(new Error('Face verification engine did not load.'));
    };
    const existing = document.querySelector<HTMLScriptElement>('script[data-sahal-face-api="true"]');
    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', fail, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = '/biometrics/face-api.min.js';
    script.async = true;
    script.dataset.sahalFaceApi = 'true';
    script.onload = finish;
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error) => {
    faceApiPromise = null;
    document.querySelector('script[data-sahal-face-api="true"]')?.remove();
    throw error;
  });

  return faceApiPromise;
}

async function loadFaceModels() {
  const faceapi = await loadFaceApiScript();
  if (!faceModelsPromise) {
    let timeout: number;
    faceModelsPromise = Promise.race([Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri('/biometrics/models'),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri('/biometrics/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/biometrics/models'),
    ]), new Promise((_, reject) => { timeout = window.setTimeout(() => reject(new Error('Face models could not download. Check your connection and retry.')), 60000); })]).then(() => faceapi).catch((error) => { faceModelsPromise = null; throw error; }).finally(() => window.clearTimeout(timeout));
  }
  return faceModelsPromise;
}

function distance(a: any, b: any) {
  const dx = Number(a?.x || 0) - Number(b?.x || 0);
  const dy = Number(a?.y || 0) - Number(b?.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

function eyeAspectRatio(points: any[]) {
  if (!points || points.length < 68) return 0;
  const ratio = (a: number, b: number, c: number, d: number, e: number, f: number) => {
    const horizontal = distance(points[a], points[d]);
    if (horizontal <= 0) return 0;
    return (distance(points[b], points[f]) + distance(points[c], points[e])) / (2 * horizontal);
  };
  const left = ratio(36, 37, 38, 39, 40, 41);
  const right = ratio(42, 43, 44, 45, 46, 47);
  return (left + right) / 2;
}

function normalizedTurn(points: any[]) {
  if (!points || points.length < 68) return 0;
  const leftOuter = points[36];
  const rightOuter = points[45];
  const nose = points[30];
  const eyeSpan = distance(leftOuter, rightOuter);
  if (eyeSpan <= 0) return 0;
  const centerX = (Number(leftOuter.x) + Number(rightOuter.x)) / 2;
  return Math.abs((Number(nose.x) - centerX) / eyeSpan);
}

async function detectFace(faceapi: any, video: HTMLVideoElement) {
  const results = await faceapi
    .detectAllFaces(
      video,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 })
    )
    .withFaceLandmarks(true)
    .withFaceDescriptors();
  if (results.length > 1) throw new Error('Only one person should be visible in the camera.');
  return results[0];
}

function averageDescriptors(values: Float32Array[]): number[] {
  if (!values.length) throw new Error('No face descriptor was captured.');
  const result = new Array<number>(128).fill(0);
  for (const descriptor of values) {
    for (let index = 0; index < 128; index += 1) result[index] += Number(descriptor[index]);
  }
  return result.map((value) => value / values.length);
}

function actionLabel(_actions: Challenge['actions']) {
  return 'Look straight at the phone camera for a moment.';
}

function formatTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function TeacherSmartAttendance() {
  const [status, setStatus] = useState<SmartAttendanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<VerificationMode | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setInstruction('');
  };

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/teacher-portal/smart-attendance/status');
      setStatus(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not load your smart attendance status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    const refresh = () => { if (!requestRef.current) void loadStatus(); };
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      requestRef.current?.abort();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const waitForVideo = async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (videoRef.current) return videoRef.current;
      await sleep(50);
    }
    throw new Error('Camera view could not be opened.');
  };

  const runLiveness = async (
    faceapi: any,
    video: HTMLVideoElement,
    challenge: Challenge
  ): Promise<LivenessMetrics> => {
    setInstruction(actionLabel(challenge.actions));
    const startedAt = Date.now();
    const deadline = startedAt + 12000;
    let attempts = 0;
    let samples = 0;
    let minEar = Number.POSITIVE_INFINITY;
    let maxEar = 0;
    let maxTurn = 0;

    while (Date.now() < deadline) {
      if (requestRef.current?.signal.aborted) throw new Error('Verification cancelled.');
      attempts += 1;
      const result = await detectFace(faceapi, video);
      if (result) {
        samples += 1;
        const points = result.landmarks.positions;
        const ear = eyeAspectRatio(points);
        if (ear > 0) {
          minEar = Math.min(minEar, ear);
          maxEar = Math.max(maxEar, ear);
        }
        maxTurn = Math.max(maxTurn, normalizedTurn(points));
      }
      if (samples >= 3 && samples / attempts >= 0.25 && Date.now() - startedAt >= 600) break;
      setInstruction(samples ? 'Face detected. Hold still for a moment.' : 'Position your face in the camera with good lighting.');
      await sleep(220);
    }

    const metrics: LivenessMetrics = {
      sampleCount: samples,
      durationMs: Date.now() - startedAt,
      blinkScore: Number.isFinite(minEar) ? Math.max(0, maxEar - minEar) : 0,
      turnScore: maxTurn,
      facePresenceRatio: attempts ? samples / attempts : 0,
    };

    if (metrics.sampleCount < 2 || metrics.facePresenceRatio < 0.25) {
      throw new Error('Look straight at the camera for a moment and try again.');
    }
    if (challenge.actions.includes('blink') && metrics.blinkScore < 0.018) {
      throw new Error('Blink was not detected. Blink once naturally and try again.');
    }
    if (
      (challenge.actions.includes('turn_left') || challenge.actions.includes('turn_right')) &&
      metrics.turnScore < 0.03
    ) {
      throw new Error('Look to your right once, then look back at the camera and try again.');
    }

    return metrics;
  };

  const captureStraightDescriptor = async (faceapi: any, video: HTMLVideoElement) => {
    setInstruction('Look straight at the camera and hold still.');
    await sleep(600);
    const descriptors: Float32Array[] = [];
    for (let attempt = 0; attempt < 10 && descriptors.length < 3; attempt += 1) {
      if (requestRef.current?.signal.aborted) throw new Error('Verification cancelled.');
      const result = await detectFace(faceapi, video);
      if (result?.descriptor) {
        const descriptor = result.descriptor as Float32Array;
        const first = descriptors[0];
        if (!first || Math.sqrt(Array.from(descriptor).reduce((sum, value, index) => sum + (value - first[index]) ** 2, 0)) <= 0.45) descriptors.push(descriptor);
      }
      await sleep(260);
    }
    if (descriptors.length < 2) {
      throw new Error('Look straight at the camera for a moment and try again.');
    }
    return averageDescriptors(descriptors);
  };

  const verify = async (mode: VerificationMode) => {
    if (requestRef.current) return;
    if (mode === 'enroll' && !consent) {
      setError('Please confirm biometric consent before enrolling your face.');
      return;
    }

    const request = new AbortController();
    requestRef.current = request;
    setBusy(mode);
    setError('');
    setMessage('');
    let stream: MediaStream | null = null;

    try {
      setInstruction('Checking GPS and preparing secure face verification...');
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires HTTPS and a supported browser.');
      const faceapi = await loadFaceModels();
      if (request.signal.aborted) return;

      setCameraOpen(true);
      const video = await waitForVideo();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      if (request.signal.aborted) return;
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      for (let attempt = 0; video.readyState < 2 && attempt < 100; attempt += 1) {
        if (request.signal.aborted) return;
        await sleep(50);
      }
      if (video.readyState < 2) throw new Error('Camera did not become ready. Close other camera apps and retry.');
      const [location, challengeResponse] = await Promise.all([
        mode === 'enroll' && !status?.settings.enrollmentRequiresGeofence
          ? Promise.resolve(undefined)
          : getAttendanceLocation(status?.settings.maxAccuracyMeters, request.signal),
        status?.settings.requireLiveness
          ? api.get('/teacher-portal/smart-attendance/challenge', { signal: request.signal })
          : Promise.resolve(null),
      ]);
      const challenge = challengeResponse?.data?.data as Challenge | undefined;
      if (request.signal.aborted) return;

      const liveness = status?.settings.requireLiveness && challenge
        ? await runLiveness(faceapi, video, challenge)
        : {
            sampleCount: 0,
            durationMs: 0,
            blinkScore: 0,
            turnScore: 0,
            facePresenceRatio: 1,
          };
      const descriptor = await captureStraightDescriptor(faceapi, video);

      const payload = {
        location,
        challengeToken: challenge?.token,
        liveness,
        descriptor,
        device: navigator.userAgent,
        ...(mode === 'enroll' ? { consent: true } : {}),
      };

      const endpoint =
        mode === 'enroll'
          ? '/teacher-portal/smart-attendance/enroll'
          : mode === 'check-in'
            ? '/teacher-portal/smart-attendance/check-in'
            : '/teacher-portal/smart-attendance/check-out';

      if (request.signal.aborted) return;
      setInstruction('Saving verified attendance...');
      const response = await api.post(endpoint, payload, { signal: request.signal });
      setMessage(
        response.data?.message ||
          (mode === 'enroll'
            ? 'Face enrollment completed.'
            : mode === 'check-in'
              ? 'Attendance recorded successfully.'
              : 'Check-out recorded successfully.')
      );
      if (mode === 'enroll') setConsent(false);
      await loadStatus();
    } catch (err: any) {
      if (!request.signal.aborted && err.response?.status === 409) await loadStatus();
      if (!request.signal.aborted) setError(err.response?.data?.message || (err?.name === 'NotAllowedError' ? 'Camera permission is blocked. Allow camera access for this site and try again.' : err?.message) || 'Verification failed. Please try again.');
    } finally {
      request.abort();
      requestRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      stopCamera();
      setBusy(null);
    }
  };

  const attendance = status?.todayAttendance;
  const verified = attendance?.verification;

  return (
    <section className="mx-4 mt-4 overflow-hidden rounded-3xl border border-emerald-200 bg-[var(--color-surface-primary)] shadow-sm sm:mx-6 sm:mt-6">
      <div className="border-b border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-5 dark:from-emerald-950/30 dark:via-[var(--color-surface-primary)] dark:to-cyan-950/20 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                My Attendance
              </p>
              <h2 className="mt-1 text-xl font-black text-[var(--color-text-primary)] sm:text-2xl">
                Verify your presence
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--color-text-secondary)]">
                GPS geofence and encrypted face matching must pass before attendance is recorded. Just look straight at the phone camera.
              </p>
            </div>
          </div>

          {!loading && attendance?.checkInAt && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-950/25">
              <p className="font-black text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
                Present today
              </p>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                In {formatTime(attendance.checkInAt)}
                {attendance.checkOutAt ? ' · Out ' + formatTime(attendance.checkOutAt) : ''}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        {loading ? (
          <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" /> Loading smart attendance...
          </div>
        ) : !status ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error || 'Attendance status is unavailable.'}</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] p-3.5">
                <MapPin className="h-5 w-5 text-emerald-600" />
                <div><p className="text-xs text-[var(--color-text-tertiary)]">GPS area</p><p className="text-sm font-bold">{status.settings.locationConfigured ? status.settings.radiusMeters + ' m school radius' : 'Not configured'}</p><p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">GPS accuracy is considered automatically</p></div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] p-3.5">
                <ScanFace className="h-5 w-5 text-violet-600" />
                <div><p className="text-xs text-[var(--color-text-tertiary)]">Face template</p><p className="text-sm font-bold">{status.biometricEnrolled ? 'Enrolled' : 'Enrollment required'}</p></div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] p-3.5">
                <Camera className="h-5 w-5 text-cyan-600" />
                <div><p className="text-xs text-[var(--color-text-tertiary)]">Face check</p><p className="text-sm font-bold">{status.settings.requireLiveness ? 'Face presence + match' : 'Face match only'}</p></div>
              </div>
            </div>

            {!status.settings.enabled && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Smart teacher attendance is currently disabled by your administrator.
              </div>
            )}
            {status.settings.enabled && !status.settings.locationConfigured && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                School GPS location has not been configured yet. Ask an administrator to open HR → Staff Attendance → Smart Attendance Settings.
              </div>
            )}

            {message && (
              <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {message}
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            {status.configured && !status.biometricEnrolled && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:bg-violet-950/15">
                <p className="font-bold text-[var(--color-text-primary)]">First-time face enrollment</p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                  A 128-value face template is encrypted on the server. Camera photos/video are not uploaded or stored.
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>I consent to using and storing my encrypted face template for attendance verification.</span>
                </label>
                <button
                  type="button"
                  disabled={!consent || Boolean(busy)}
                  onClick={() => void verify('enroll')}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === 'enroll' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanFace className="h-4 w-4" />}
                  Enroll Face
                </button>
              </div>
            )}

            {status.configured && status.biometricEnrolled && !attendance?.checkInAt && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void verify('check-in')}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-base font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {busy === 'check-in' ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                Verify & Check In
              </button>
            )}

            {status.configured && status.biometricEnrolled && attendance?.checkInAt && !attendance?.checkOutAt && status.settings.checkOutEnabled && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void verify('check-out')}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60 sm:w-auto"
              >
                {busy === 'check-out' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Clock3 className="h-5 w-5" />}
                Verify & Check Out
              </button>
            )}

            {attendance?.checkInAt && verified && (
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-800">GPS ✓{verified.distanceMeters !== undefined ? ' · ' + Math.round(verified.distanceMeters) + ' m' : ''}</span>
                <span className="rounded-full bg-violet-100 px-3 py-1.5 text-violet-800">Face ✓</span>
                {verified.livenessVerified && <span className="rounded-full bg-cyan-100 px-3 py-1.5 text-cyan-800">Face presence ✓</span>}
              </div>
            )}
          </>
        )}

        {busy && !cameraOpen && <p role="status" className="text-sm text-cyan-700">{instruction}</p>}
        {busy && <button type="button" onClick={() => { requestRef.current?.abort(); stopCamera(); }} className="min-h-10 rounded-xl border px-4 text-sm">Cancel verification</button>}
        {cameraOpen && (
          <div className="rounded-2xl border border-cyan-200 bg-slate-950 p-3 text-white">
            <div className="relative mx-auto aspect-[4/3] max-w-lg overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} muted playsInline className="h-full w-full object-cover [transform:scaleX(-1)]" />
              <div className="pointer-events-none absolute inset-0 border-[3px] border-cyan-400/50" />
            </div>
            <div className="mx-auto mt-3 flex max-w-lg items-start gap-2 text-sm">
              <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <p>{instruction || 'Preparing camera...'}</p>
            </div>
          </div>
        )}

        <p className="text-[11px] leading-5 text-[var(--color-text-tertiary)]">
          GPS and camera permissions are required only during verification. Face images are processed on this device; the server receives the numeric face template and verification measurements, not the camera photo/video.
        </p>
      </div>
    </section>
  );
}

export default TeacherSmartAttendance;
