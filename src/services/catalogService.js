import { requireSupabase } from './supabase.js';

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function assertResult(error, fallback) {
  if (error) throw new Error(error.message || fallback);
}

export async function getCategories() {
  const { data, error } = await requireSupabase()
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  assertResult(error, 'Unable to load categories.');
  return data || [];
}

export async function saveCategory(category) {
  const values = {
    name: category.name.trim(),
    slug: slugify(category.slug || category.name),
    description: category.description?.trim() || null,
    sort_order: Number.parseInt(category.sort_order, 10) || 0,
    is_active: category.is_active !== false,
  };
  const query = category.id
    ? requireSupabase().from('categories').update(values).eq('id', category.id)
    : requireSupabase().from('categories').insert(values);
  const { data, error } = await query.select().single();
  assertResult(error, 'Unable to save the category.');
  return data;
}

export async function deleteCategory(id) {
  const { data, error } = await requireSupabase().from('categories').delete().eq('id', id).select('id');
  assertResult(error, 'Unable to delete the category.');
  if (!data?.length) throw new Error('Category was not deleted. Check its story references and admin access.');
}

export async function getLanguages() {
  const { data, error } = await requireSupabase()
    .from('languages')
    .select('*')
    .order('name', { ascending: true });
  assertResult(error, 'Unable to load languages.');
  return data || [];
}

export async function saveLanguage(language) {
  const values = {
    code: language.code.trim().toLowerCase(),
    name: language.name.trim(),
    native_name: language.native_name?.trim() || null,
    is_active: language.is_active !== false,
  };
  const query = language.id
    ? requireSupabase().from('languages').update(values).eq('id', language.id)
    : requireSupabase().from('languages').insert(values);
  const { data, error } = await query.select().single();
  assertResult(error, 'Unable to save the language.');
  return data;
}

export async function deleteLanguage(id) {
  const { data, error } = await requireSupabase().from('languages').delete().eq('id', id).select('id');
  assertResult(error, 'Unable to delete the language.');
  if (!data?.length) throw new Error('Language was not deleted. Check its story references and admin access.');
}
