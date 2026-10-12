import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const commit = process.env.FACE_API_COMMIT || 'a86f011d72124e5fb93e59d5c4ab98f699dd5c9c';
const baseUrl = process.env.FACE_API_BASE_URL || 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js';
const base = baseUrl.replace(/\/+$/, '') + '/' + commit;
const timeoutMs = Number(process.env.FACE_API_FETCH_TIMEOUT_MS) || 60_000;
const attempts = 4;
const parallel = 3;
const markerPath = join(process.cwd(), 'public/biometrics/.face-api-commit');

const assets = [
  ['dist/face-api.min.js', 'public/biometrics/face-api.min.js'],
  ['LICENSE', 'public/biometrics/LICENSE-face-api.txt'],
  ['weights/tiny_face_detector_model-weights_manifest.json', 'public/biometrics/models/tiny_face_detector_model-weights_manifest.json'],
  ['weights/tiny_face_detector_model-shard1', 'public/biometrics/models/tiny_face_detector_model-shard1'],
  ['weights/face_landmark_68_tiny_model-weights_manifest.json', 'public/biometrics/models/face_landmark_68_tiny_model-weights_manifest.json'],
  ['weights/face_landmark_68_tiny_model-shard1', 'public/biometrics/models/face_landmark_68_tiny_model-shard1'],
  ['weights/face_recognition_model-weights_manifest.json', 'public/biometrics/models/face_recognition_model-weights_manifest.json'],
  ['weights/face_recognition_model-shard1', 'public/biometrics/models/face_recognition_model-shard1'],
  ['weights/face_recognition_model-shard2', 'public/biometrics/models/face_recognition_model-shard2'],
];

const present = async (path) => {
  try { return (await stat(path)).size > 0; } catch { return false; }
};

// Already fetched for this exact commit (for example in an earlier Docker layer): nothing to download.
const alreadyFetched = async () => {
  try {
    if ((await readFile(markerPath, 'utf8')).trim() !== commit) return false;
  } catch {
    return false;
  }
  return (await Promise.all(assets.map(([, destination]) => present(join(process.cwd(), destination))))).every(Boolean);
};

// A stalled connection must fail (and retry) instead of hanging the whole deployment.
async function download(url) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  throw new Error('Failed to download biometric asset ' + url + ' after ' + attempts + ' attempts: ' + (lastError?.message || lastError));
}

if (await alreadyFetched()) {
  console.log('biometric assets already present for commit ' + commit + ', skipping download');
} else {
  const queue = [...assets];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [source, destination] = item;
      const bytes = await download(base + '/' + source);
      const fullPath = join(process.cwd(), destination);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, bytes);
      console.log('biometric asset:', destination, bytes.length, 'bytes');
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  await writeFile(markerPath, commit + '\n');
}
