import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { hasFirebaseConfig, storage } from './firebase.js';

function extractStoragePathFromUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const tokenIndex = pathParts.findIndex((part) => part === 'o');

    if (tokenIndex >= 0 && tokenIndex + 1 < pathParts.length) {
      const encodedPath = pathParts.slice(tokenIndex + 1).join('/');
      return decodeURIComponent(encodedPath);
    }
  } catch {
    // ignore malformed URLs and fall back to the old image path logic below
  }

  return null;
}

export function uploadImageFile(file, pathPrefix = 'stories', onProgress = () => {}, storyId = 'draft', previousImageUrl = '') {
  return new Promise((resolve, reject) => {
    if (!storage || !hasFirebaseConfig) {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Unable to read the selected file.'));
      reader.readAsDataURL(file);
      return;
    }

    const safeStoryId = String(storyId || 'draft').trim().replace(/[^a-zA-Z0-9._-]+/g, '_') || 'draft';
    const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    const normalizedPathPrefix = `${pathPrefix}/${safeStoryId}`.replace(/\/+/g, '/');
    const fileRef = ref(storage, `${normalizedPathPrefix}/${safeName}`);
    const uploadTask = uploadBytesResumable(fileRef, file);

    const replacePreviousImage = async () => {
      const previousPath = extractStoragePathFromUrl(previousImageUrl);
      if (!previousPath) {
        return;
      }

      try {
        await deleteObject(ref(storage, previousPath));
      } catch {
        // The old file may already be gone, so ignore cleanup errors.
      }
    };

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress(progress);
      },
      (error) => reject(error),
      async () => {
        try {
          await replacePreviousImage();
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}
