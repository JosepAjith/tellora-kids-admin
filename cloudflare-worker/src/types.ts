export interface Env {
  STORY_ASSETS: R2Bucket;
  ALLOWED_ORIGINS: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_ADMIN_RPC: string;
  MAX_IMAGE_BYTES?: string;
  MAX_DELETE_KEYS?: string;
}

export interface AdminIdentity {
  id: string;
  email?: string;
}

export type AssetType = 'cover' | 'page';

export interface UploadDescriptor {
  assetType: AssetType;
  contentType: AllowedImageMimeType;
  extension: AllowedImageExtension;
  key: string;
  size: number;
  storyPathId: string;
}

export interface UploadMetadata {
  assetType: AssetType;
  contentType: AllowedImageMimeType;
  extension: AllowedImageExtension;
  storyPathId: string;
}

export type AllowedImageMimeType = 'image/avif' | 'image/jpeg' | 'image/png' | 'image/webp';
export type AllowedImageExtension = 'avif' | 'jpg' | 'png' | 'webp';
