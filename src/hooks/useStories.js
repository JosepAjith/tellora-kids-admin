import { useCallback, useEffect, useState } from 'react';
import { hasFirebaseConfig } from '../services/firebase.js';
import { addStory, deleteStory, getStories, updateStory } from '../services/storyService';

export function useStories() {
  const [stories, setStories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshStories = useCallback(async () => {
    if (!hasFirebaseConfig) {
      setStories([]);
      setCategories([]);
      setError('Firestore is not connected yet. Add your Firebase config to the project .env file to load stories and dashboard counts.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const storyData = await getStories();
      setStories(storyData);
      setCategories([...new Set(storyData.map((story) => story.category).filter(Boolean))]);
      setError('');
    } catch (err) {
      setError(err.message || 'Unable to load stories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStories();
  }, [refreshStories, hasFirebaseConfig]);

  const saveStory = async (payload, existingId) => {
    if (existingId) {
      const updatedStory = await updateStory(existingId, payload);
      setStories((current) => current.map((story) => (story.id === existingId ? { ...story, ...updatedStory } : story)));
      return updatedStory;
    }

    const addedStory = await addStory(payload);
    setStories((current) => [addedStory, ...current]);
    return addedStory;
  };

  const removeStory = async (id) => {
    await deleteStory(id);
    setStories((current) => current.filter((story) => story.id !== id));
  };

  return { stories, categories, loading, error, refreshStories, saveStory, removeStory };
}
