import { v2 as cloudinary } from 'cloudinary';
import stream from 'stream';

export interface StoredUpload {
  url: string;
  publicId?: string;
  provider: 'cloudinary' | 'local';
}

export const cloudinaryEnabled = Boolean(process.env.CLOUDINARY_URL);

if (cloudinaryEnabled) {
  cloudinary.config({ secure: true });
}

export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  resourceType: 'image' | 'raw' = 'raw',
): Promise<StoredUpload> {
  if (!cloudinaryEnabled) throw new Error('Cloudinary is not configured');

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        type: 'authenticated',
        use_filename: false,
        unique_filename: true,
      },
      (error, result) => {
        if (error || !result?.secure_url || !result.public_id) {
          reject(error || new Error('Cloudinary upload failed'));
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id, provider: 'cloudinary' });
      },
    );
    const readable = new stream.PassThrough();
    readable.end(buffer);
    readable.pipe(upload);
  });
}

export async function deleteFromCloudinary(publicId: string, resourceType: 'image' | 'raw' = 'raw'): Promise<void> {
  if (!cloudinaryEnabled || !publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated', invalidate: true });
}

export function getCloudinaryPrivateUrl(publicId: string, resourceType: 'image' | 'raw' = 'raw'): string {
  return cloudinary.url(publicId, { secure: true, type: 'authenticated', sign_url: true, resource_type: resourceType });
}
