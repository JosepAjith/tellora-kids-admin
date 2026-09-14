import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { addStory, deleteStory, getStories, updateStory } from '../services/storyService';
import { getCategories, getLanguages } from '../services/catalogService';

export function useStories() {
  const { isAuthenticated } = useAuth();
  const [stories, setStories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refreshStories = useCallback(async () => {
    if (!isAuthenticated) {
      setStories([]);
      setCategories([]);
      setLanguages([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [storyData, categoryData, languageData] = await Promise.all([
        getStories(),
        getCategories(),
        getLanguages(),
      ]);
      setStories(storyData);
      setCategories(categoryData);
      setLanguages(languageData);
      setError('');
    } catch (err) {
      setStories([]);
      setCategories([]);
      setLanguages([]);
      setError(err.message || 'Unable to load stories.');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!active) return;
      await refreshStories();
    })();

    return () => {
      active = false;
    };
  }, [refreshStories]);

  const saveStory = async (payload, existingId) => {
    if (existingId) {
      const updatedStory = await updateStory(existingId, payload);
      setStories((current) => current.map((story) => (story.id === existingId ? { ...story, ...updatedStory } : story)));
      return updatedStory;
    }

    const addedStory = await addStory(payload);
    setStories((current) => [addedStory, ...current]);
    await refreshStories();
    return addedStory;
  };

  const removeStory = async (id) => {
    const result = await deleteStory(id);
    setStories((current) => current.filter((story) => story.id !== id));
    return result;
  };

  return { stories, categories, languages, loading, error, refreshStories, saveStory, removeStory };
}
