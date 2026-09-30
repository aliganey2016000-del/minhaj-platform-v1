import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const commit = process.env.FACE_API_COMMIT || 'a86f011d72124e5fb93e59d5c4ab98f699dd5c9c';
const base = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/' + commit;

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

for (const [source, destination] of assets) {
  const url = base + '/' + source;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to download biometric asset ' + source + ': HTTP ' + response.status);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const fullPath = join(process.cwd(), destination);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
  console.log('biometric asset:', destination, bytes.length, 'bytes');
}
