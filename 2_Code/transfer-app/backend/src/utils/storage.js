import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';

const LOCAL_STORAGE_DIR = path.resolve(env.STORAGE_LOCAL_DIR || './storage');

function ensureLocalDir() {
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }
}

/**
 * Upload a file buffer to storage (Supabase or local filesystem).
 */
export async function uploadFile(buffer, storagePath, mimeType) {
  if (env.STORAGE_PROVIDER === 'supabase' && env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data, error } = await supabaseAdmin.storage
      .from(env.STORAGE_BUCKET)
      .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
    if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);
    return { path: data.path, provider: 'supabase' };
  }
  ensureLocalDir();
  const fullPath = path.join(LOCAL_STORAGE_DIR, storagePath);
  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, buffer);
  return { path: storagePath, provider: 'local' };
}

/**
 * Get a download URL for a stored file.
 */
export async function getFileUrl(storagePath, expiresIn = 3600) {
  if (env.STORAGE_PROVIDER === 'supabase' && env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data, error } = await supabaseAdmin.storage
      .from(env.STORAGE_BUCKET)
      .createSignedUrl(storagePath, expiresIn);
    if (error) throw new Error(`Failed to create signed URL: ${error.message}`);
    return data.signedUrl;
  }
  return path.join(LOCAL_STORAGE_DIR, storagePath);
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(storagePath) {
  if (env.STORAGE_PROVIDER === 'supabase' && env.SUPABASE_SERVICE_ROLE_KEY) {
    const { error } = await supabaseAdmin.storage.from(env.STORAGE_BUCKET).remove([storagePath]);
    if (error) throw new Error(`Failed to delete file: ${error.message}`);
    return;
  }
  const fullPath = path.join(LOCAL_STORAGE_DIR, storagePath);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
}

export default { uploadFile, getFileUrl, deleteFile };
