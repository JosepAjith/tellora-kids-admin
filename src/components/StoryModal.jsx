import { useState } from 'react';

const emptyStory = {
  title: '',
  category: 'Adventure',
  summary: '',
  premium: false,
  readTime: '5 min',
};

export function StoryModal({ open, story, categories, onClose, onSave }) {
  if (!open) {
    return null;
  }

  const storyKey = story?.id || story?.storyId || 'new';
  return <StoryModalContent key={storyKey} story={story} categories={categories} onClose={onClose} onSave={onSave} />;
}

function StoryModalContent({ story, categories, onClose, onSave }) {
  const [formData, setFormData] = useState(() =>
    story
      ? {
          title: story.title || '',
          category: story.category || 'Adventure',
          summary: story.summary || '',
          premium: Boolean(story.premium),
          readTime: story.readTime || '5 min',
        }
      : emptyStory
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave(formData);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <h3>{story ? 'Edit story' : 'Create story'}</h3>
          <button className="ghost-btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <form className="story-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Title</span>
            <input
              required
              value={formData.title}
              onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>Category</span>
            <select
              value={formData.category}
              onChange={(event) => setFormData((current) => ({ ...current, category: event.target.value }))}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Summary</span>
            <textarea
              rows="4"
              value={formData.summary}
              onChange={(event) => setFormData((current) => ({ ...current, summary: event.target.value }))}
            />
          </label>

          <label className="field checkbox-row">
            <input
              type="checkbox"
              checked={formData.premium}
              onChange={(event) => setFormData((current) => ({ ...current, premium: event.target.checked }))}
            />
            <span>Premium story</span>
          </label>

          <label className="field">
            <span>Read time</span>
            <input
              value={formData.readTime}
              onChange={(event) => setFormData((current) => ({ ...current, readTime: event.target.value }))}
            />
          </label>

          <div className="modal-actions">
            <button className="secondary-btn" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-btn" type="submit">
              {story ? 'Save changes' : 'Create story'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
