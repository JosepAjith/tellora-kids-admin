import { getAssetUrl } from './assetUrl.js';
import { deleteStoryAssets } from './storageService.js';
import { requireSupabase } from './supabase.js';

const STORY_SELECT = `
  *,
  category:categories(id, name, slug),
  language:languages(id, code, name, native_name),
  pages:story_pages(id, position, text, image_object_key, image_url, audio_object_key, audio_url, created_at, updated_at)
`;

function asInteger(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizePage(row, index) {
  const imageKey = row.image_object_key || '';
  const imageUrl = imageKey ? getAssetUrl(imageKey) : row.image_url || '';

  return {
    id: row.id,
    page: row.position ?? index + 1,
    position: row.position ?? index + 1,
    text: row.text || '',
    imageKey,
    imageUrl,
    audioKey: row.audio_object_key || '',
    audioUrl: row.audio_url || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
}

export function normalizeStory(row = {}) {
  const categoryRecord = row.category && typeof row.category === 'object' ? row.category : null;
  const languageRecord = row.language && typeof row.language === 'object' ? row.language : null;
  const pages = Array.isArray(row.pages) ? [...row.pages] : [];
  const coverImageKey = row.cover_object_key || '';
  const coverImageUrl = coverImageKey ? getAssetUrl(coverImageKey) : row.cover_url || '';

  return {
    id: row.id,
    slug: row.slug || '',
    title: row.title || '',
    categoryId: row.category_id || '',
    category: categoryRecord?.name || '',
    categoryRecord,
    languageId: row.language_id || '',
    language: languageRecord?.name || '',
    languageRecord,
    ageGroup: row.age_group || '',
    readingTime: row.reading_time_minutes ? String(row.reading_time_minutes) : '',
    readingTimeMinutes: row.reading_time_minutes || null,
    description: row.description || '',
    moral: row.moral || '',
    coverImageKey,
    coverImage: coverImageUrl,
    coverImageUrl,
    musicKey: row.music_object_key || '',
    music: row.music_url || '',
    status: row.status === 'published' ? 'published' : 'draft',
    isPremium: Boolean(row.is_premium),
    isFeatured: Boolean(row.is_featured),
    publishedAt: row.published_at || '',
    version: row.version || 1,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    pages: pages
      .slice()
      .sort((first, second) => (first.position || 0) - (second.position || 0))
      .map(normalizePage),
  };
}

export function buildStoryPayload(formData, existingId = '') {
  const generatedSlug = slugify(formData.slug || formData.title || 'story');

  const story = {
    slug: generatedSlug || 'story',
    title: formData.title?.trim() || '',
    category_id: formData.categoryId || null,
    language_id: formData.languageId || null,
    age_group: formData.ageGroup?.trim() || '',
    reading_time_minutes: asInteger(formData.readingTime),
    description: formData.description?.trim() || '',
    moral: formData.moral?.trim() || '',
    cover_object_key: formData.coverImageKey || null,
    cover_url: formData.coverImageKey ? null : formData.coverImage?.trim() || null,
    music_object_key: formData.musicKey || null,
    music_url: formData.music?.trim() || null,
    status: formData.status === 'published' ? 'published' : 'draft',
    is_premium: Boolean(formData.isPremium),
    is_featured: Boolean(formData.isFeatured),
  };

  const id = existingId || formData.id || formData.storyId;
  if (id) story.id = id;
  if (existingId && formData.version) story.expected_version = formData.version;

  const pages = (formData.pages || []).map((page) => ({
    ...(page.persistedId ? { id: page.persistedId } : {}),
    text: page.text || '',
    image_object_key: page.imageKey || null,
    image_url: page.imageKey ? null : page.imageUrl || null,
    audio_object_key: page.audioKey || null,
    audio_url: page.audioUrl || null,
  }));

  return { story, pages };
}

function throwIfError(error, fallback) {
  if (error) {
    throw new Error(error.message || fallback);
  }
}

export async function getStories() {
  const client = requireSupabase();
  const { data, error } = await client.from('stories').select(STORY_SELECT).order('updated_at', { ascending: false });
  throwIfError(error, 'Unable to load stories from Supabase.');
  return (data || []).map(normalizeStory);
}

export async function getStory(id) {
  const client = requireSupabase();
  const { data, error } = await client.from('stories').select(STORY_SELECT).eq('id', id).maybeSingle();
  throwIfError(error, `Unable to load story ${id}.`);
  return data ? normalizeStory(data) : null;
}

export async function saveStory(payload, existingId = '') {
  const client = requireSupabase();
  const { story, pages } = buildStoryPayload(payload, existingId);
  const { data, error } = await client.rpc('admin_save_story', {
    p_story: story,
    p_pages: pages,
  });
  throwIfError(error, 'Unable to save the story.');

  if (!data?.story) {
    throw new Error('Supabase saved the story but returned an unexpected response.');
  }

  return normalizeStory({ ...data.story, pages: data.pages || [] });
}

export async function addStory(payload) {
  return saveStory(payload);
}

export async function updateStory(id, payload) {
  return saveStory(payload, id);
}

export async function deleteStory(id) {
  const client = requireSupabase();
  const { data: existing, error: readError } = await client
    .from('stories')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  throwIfError(readError, `Unable to read story ${id} before deletion.`);

  if (!existing) {
    throw new Error(`Story ${id} was not found or you do not have permission to delete it.`);
  }

  const { data: deletedRows, error: deleteError } = await client.from('stories').delete().eq('id', id).select('id');
  throwIfError(deleteError, `Unable to delete story ${id}.`);

  if (!deletedRows?.length) {
    throw new Error(`Story ${id} was not deleted. Check the admin RLS policy and active admin membership.`);
  }

  let cleanupWarning = '';
  try {
    await deleteStoryAssets(id);
  } catch (error) {
    cleanupWarning = `The story was deleted, but some R2 assets require cleanup: ${error.message}`;
  }

  return { id, cleanupWarning };
}
