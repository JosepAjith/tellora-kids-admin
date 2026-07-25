import { setDoc, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { db, hasFirebaseConfig } from './firebase.js';


const STORIES_COLLECTIONS = ['stories', 'story', 'Story', 'storys', 'content'];

export function getFallbackStories() {
  return [
    {
      id: 'fallback_story_001',
      title: 'The Moon Boat',
      category: 'Adventure',
      ageGroup: '4-6',
      readingTime: '5 min',
      language: 'English',
      description: 'A gentle story about curiosity and courage.',
      moral: 'Be brave and kind.',
      coverImage: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=80',
      music: '',
      status: 'published',
      isFeatured: true,
      isPremium: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pages: [{ page: 1, text: 'A little boat sailed over the moonlit sea.', imageUrl: '' }],
    },
    {
      id: 'fallback_story_002',
      title: 'The Rainbow Garden',
      category: 'Fantasy',
      ageGroup: '6-8',
      readingTime: '7 min',
      language: 'English',
      description: 'A magical garden story for bedtime reading.',
      moral: 'Nature teaches patience.',
      coverImage: 'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07?auto=format&fit=crop&w=900&q=80',
      music: '',
      status: 'draft',
      isFeatured: false,
      isPremium: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pages: [{ page: 1, text: 'A rainbow touched the garden and woke the flowers.', imageUrl: '' }],
    },
  ];
}

function normalizeStatus(status) {
  if (!status) {
    return 'draft';
  }

  return String(status).toLowerCase() === 'published' ? 'published' : 'draft';
}

function buildStoryId(stories) {
  const ids = stories
    .map((story) => story.id)
    .filter(Boolean)
    .map((id) => Number(id.split('_').pop()))
    .filter((value) => !Number.isNaN(value));

  const nextNumber = ids.length ? Math.max(...ids) + 1 : 1;
  return `story_${String(nextNumber).padStart(4, '0')}`;
}

function normalizeStory(document, fallbackId) {
  const data = document.data ? document.data() : document;
  return {
    id: document.id || fallbackId || '',
    ...data,
    title: data.title || data.name || '',
    category: data.category || data.type || '',
    coverImage: data.coverImage || data.coverImageUrl || data.image || '',
    ageGroup: data.ageGroup || data.age || '',
    readingTime: data.readingTime || data.readTime || data.time || '',
    language: data.language || 'English',
    description: data.description || data.summary || data.content || '',
    moral: data.moral || data.lesson || '',
    music: data.music || data.backgroundMusicUrl || data.audio || '',
    status: normalizeStatus(data.status),
    isFeatured: Boolean(data.isFeatured ?? data.featured ?? false),
    isPremium: Boolean(data.isPremium ?? data.premium ?? false),
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || data.created_at || '',
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || data.updated_at || '',
    pages: (data.pages || data.storyPages || []).map((page, index) => ({
      ...page,
      page: page.page || index + 1,
    })),
  };
}

export function buildStoryPayload(formData) {
  const coverImage = formData.coverImage?.trim() || formData.coverImageUrl?.trim() || '';

  return {
    title: formData.title?.trim() || '',
    category: formData.category?.trim() || '',
    storyId: formData.storyId?.trim() || formData.id?.trim() || '',
    coverImage,
    coverImageUrl: coverImage,
    ageGroup: formData.ageGroup?.trim() || '',
    readingTime: formData.readingTime?.trim() || '',
    language: formData.language?.trim() || 'English',
    description: formData.description?.trim() || '',
    moral: formData.moral?.trim() || '',
    music: formData.music?.trim() || formData.backgroundMusicUrl?.trim() || '',
    status: normalizeStatus(formData.status),
    isFeatured: Boolean(formData.isFeatured ?? formData.featured),
    isPremium: Boolean(formData.isPremium ?? formData.premium),
    pages: (formData.pages || []).map((page, index) => {
      const imageUrl = page.imageUrl || page.image || '';

      return {
        ...page,
        image: imageUrl,
        imageUrl,
        text: page.text || '',
        page: page.page || index + 1,
      };
    }),
  };
}

export async function getStories() {
  if (!db || !hasFirebaseConfig) {
    throw new Error('Firebase Firestore is not configured for this app yet.');
  }

  const stories = [];
  const errors = [];

  const tryCollection = async (collectionRef, collectionName) => {
    try {
      const fallbackSnapshot = await getDocs(collectionRef);
      return fallbackSnapshot.docs.map((document) => normalizeStory(document));
    } catch (error) {
      const message = String(error?.message || '');
      if (message.includes('permission-denied') || message.includes('permission')) {
        errors.push(`Firestore denied access to the ${collectionName} collection. Check your Firestore rules and Authentication settings.`);
      } else if (!message.includes('not-found') && !message.includes('does not exist')) {
        errors.push(message || `Unable to read the ${collectionName} collection.`);
      }

      return [];
    }
  };

  for (const collectionName of STORIES_COLLECTIONS) {
    const topLevelStories = await tryCollection(collection(db, collectionName), collectionName);
    stories.push(...topLevelStories);

    if (topLevelStories.length === 0) {
      const groupStories = await tryCollection(collectionGroup(db, collectionName), collectionName);
      stories.push(...groupStories);
    }
  }

  const uniqueStories = stories.filter((story, index, array) => array.findIndex((candidate) => candidate.id === story.id) === index);

  if (uniqueStories.length === 0) {
    if (errors.length > 0) {
      throw new Error(errors[0]);
    }

    throw new Error('No story documents were found in the configured Firestore project or collection.');
  }

  return uniqueStories;
}

export function getStoryCollectionCandidates(preferredCollectionName = STORIES_COLLECTIONS[0]) {
  const candidates = [preferredCollectionName, ...STORIES_COLLECTIONS].filter(Boolean);
  return [...new Set(candidates)];
}

async function resolveStoryDocumentRef(id, preferredCollectionName = STORIES_COLLECTIONS[0]) {
  if (!db || !hasFirebaseConfig) {
    return { ref: null, collectionName: preferredCollectionName || STORIES_COLLECTIONS[0] };
  }

  for (const collectionName of getStoryCollectionCandidates(preferredCollectionName)) {
    try {
      const storyRef = doc(db, collectionName, id);
      const snapshot = await getDoc(storyRef);
      if (snapshot.exists()) {
        return { ref: storyRef, collectionName };
      }

      const collectionSnapshot = await getDocs(collection(db, collectionName));
      const matchingDocument = collectionSnapshot.docs.find((document) => {
        const data = document.data() || {};
        return document.id === id || data.id === id || data.storyId === id;
      });

      if (matchingDocument) {
        return {
          ref: doc(db, collectionName, matchingDocument.id),
          collectionName,
        };
      }
    } catch {
      // ignore and try the next collection
    }
  }

  return { ref: doc(db, preferredCollectionName || STORIES_COLLECTIONS[0], id), collectionName: preferredCollectionName || STORIES_COLLECTIONS[0] };
}

export async function getStory(id) {
  if (!db || !hasFirebaseConfig) {
    return null;
  }

  const { ref } = await resolveStoryDocumentRef(id);
  if (!ref) {
    return null;
  }

  const snapshot = await getDoc(ref);
  return snapshot.exists() ? normalizeStory(snapshot) : null;
}


export async function addStory(payload) {
  if (!db || !hasFirebaseConfig) {
    return {
      ...payload,
      id: `story_${Date.now()}`
    };
  }

  const stories = await getStories();
  const storyId = buildStoryId(stories);
  const now = new Date().toISOString();

  const storyRecord = {
    ...buildStoryPayload(payload),
    id: storyId,
    storyId,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  // Use storyId as the Firestore document ID
  const storyRef = doc(db, STORIES_COLLECTIONS[0], storyId);

  await setDoc(storyRef, storyRecord);

  return storyRecord;
}

export async function updateStory(id, payload) {
  if (!db || !hasFirebaseConfig) {
    return { ...payload, id };
  }

  const { ref: storyRef } = await resolveStoryDocumentRef(id);
  const storyPayload = {
    ...buildStoryPayload(payload),
    storyId: payload.storyId || payload.id || id,
    updatedAt: new Date().toISOString(),
  };

  await updateDoc(storyRef, storyPayload);
  return { ...storyPayload, id };
}

export async function deleteStory(id) {
  if (!db || !hasFirebaseConfig) {
    return id;
  }

  const storyRef = doc(db, STORIES_COLLECTIONS[0], id);
  await deleteDoc(storyRef);
  return id;
}
