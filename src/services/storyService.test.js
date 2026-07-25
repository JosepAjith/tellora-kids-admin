import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoryPayload, getFallbackStories, getStoryCollectionCandidates } from './storyService.js';

test('buildStoryPayload maps form values to the Firestore story schema', () => {
  const payload = buildStoryPayload({
    title: 'The Moon Boat',
    category: 'Adventure',
    coverImage: 'https://cdn.example.com/cover.png',
    ageGroup: '4-6',
    readingTime: '5 min',
    language: 'English',
    description: 'A magical bedtime tale.',
    moral: 'Kindness matters.',
    music: 'https://cdn.example.com/music.mp3',
    status: 'Published',
    isPremium: true,
    isFeatured: false,
    pages: [{ id: 'page-1', imageUrl: 'https://cdn.example.com/page.png', text: 'Hello' }],
  });

  assert.equal(payload.title, 'The Moon Boat');
  assert.equal(payload.coverImage, 'https://cdn.example.com/cover.png');
  assert.equal(payload.music, 'https://cdn.example.com/music.mp3');
  assert.equal(payload.language, 'English');
  assert.equal(payload.isPremium, true);
  assert.equal(payload.isFeatured, false);
  assert.equal(payload.status, 'published');
  assert.equal(payload.pages[0].imageUrl, 'https://cdn.example.com/page.png');
  assert.equal(payload.pages[0].page, 1);
});

test('getFallbackStories returns seeded demo stories when Firestore is unavailable', () => {
  const stories = getFallbackStories();
  assert.equal(stories.length > 0, true);
  assert.equal(stories[0].title.length > 0, true);
  assert.equal(stories[0].status, 'published');
});

test('getStoryCollectionCandidates prefers the existing collection name and falls back to the known story collections', () => {
  const candidates = getStoryCollectionCandidates('story');
  assert.deepEqual(candidates, ['story', 'stories', 'Story', 'storys', 'content']);
});

test('buildStoryPayload preserves the story identifier for storage and updates', () => {
  const payload = buildStoryPayload({ storyId: 'story_0001', title: 'Demo' });
  assert.equal(payload.storyId, 'story_0001');
});

test('buildStoryPayload stores cover and page image URLs in the fields used by the form', () => {
  const payload = buildStoryPayload({
    storyId: 'story_0001',
    coverImage: 'https://cdn.example.com/cover.png',
    pages: [{ imageUrl: 'https://cdn.example.com/page.png', text: 'Hello' }],
  });

  assert.equal(payload.coverImage, 'https://cdn.example.com/cover.png');
  assert.equal(payload.coverImageUrl, 'https://cdn.example.com/cover.png');
  assert.equal(payload.pages[0].imageUrl, 'https://cdn.example.com/page.png');
  assert.equal(payload.pages[0].image, 'https://cdn.example.com/page.png');
});
