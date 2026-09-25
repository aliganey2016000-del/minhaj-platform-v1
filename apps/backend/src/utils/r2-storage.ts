import crypto from 'crypto';
import https from 'https';

export const r2Enabled = Boolean(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME,
);

const sha256 = (value: Uint8Array | string) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key: Buffer | string, value: string) => crypto.createHmac('sha256', key).update(value).digest();
const encodeKey = (key: string) => key.split('/').map((part) => encodeURIComponent(part).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');

function credentials() {
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const accessKey = process.env.R2_ACCESS_KEY_ID || '';
  const secretKey = process.env.R2_SECRET_ACCESS_KEY || '';
  const bucket = process.env.R2_BUCKET_NAME || '';
  if (!accountId || !accessKey || !secretKey || !bucket) throw new Error('R2 is not configured.');
  return { accountId, accessKey, secretKey, bucket };
}

function signedHeaders(method: string, key: string, body: Uint8Array) {
  const { accountId, accessKey, secretKey, bucket } = credentials();
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const canonicalUri = `/${encodeURIComponent(bucket)}/${encodeKey(key)}`;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signed = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signed, payloadHash].join('\n');
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  return {
    host,
    path: canonicalUri,
    headers: {
      Host: host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    },
  };
}

async function requestR2(method: 'PUT' | 'GET' | 'DELETE', key: string, body: Uint8Array = new Uint8Array(0), contentType?: string): Promise<{ body: Buffer; contentType?: string }> {
  const signed = signedHeaders(method, key, body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: signed.host,
      port: 443,
      method,
      path: signed.path,
      headers: {
        ...signed.headers,
        ...(body.byteLength ? { 'Content-Length': String(body.byteLength) } : {}),
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
      timeout: 20000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const result = Buffer.concat(chunks);
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`R2 ${method} failed with status ${res.statusCode || 0}: ${result.toString('utf8').slice(0, 500)}`));
          return;
        }
        resolve({ body: result, contentType: typeof res.headers['content-type'] === 'string' ? res.headers['content-type'] : undefined });
      });
    });
    req.on('timeout', () => req.destroy(new Error('R2 request timed out')));
    req.on('error', reject);
    if (body.byteLength) req.write(body);
    req.end();
  });
}

export async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await requestR2('PUT', key, buffer, contentType);
}

export async function getFromR2(key: string): Promise<{ body: Buffer; contentType?: string }> {
  return requestR2('GET', key, new Uint8Array(0));
}

export async function deleteFromR2(key: string): Promise<void> {
  await requestR2('DELETE', key, new Uint8Array(0));
}

export function websiteMediaProxyUrl(schoolId: string, key: string): string {
  return `/api/v1/website-management/public/media/${encodeURIComponent(schoolId)}?key=${encodeURIComponent(key)}`;
}

export function organizationLogoProxyUrl(schoolId: string, key: string): string {
  return `/api/v1/schools/${encodeURIComponent(schoolId)}/branding/logo/public?key=${encodeURIComponent(key)}`;
}
