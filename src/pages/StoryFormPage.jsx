import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SidebarNav } from '../components/SidebarNav';
import { useStories } from '../hooks/useStories';
import { uploadImageFile } from '../services/storageService';

const createPage = () => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  imageUrl: '',
  text: '',
});

const emptyForm = {
  title: '',
  category: '',
  ageGroup: '',
  readingTime: '',
  language: 'English',
  description: '',
  moral: '',
  coverImage: '',
  music: '',
  pages: [createPage()],
  isPremium: false,
  isFeatured: false,
  status: 'draft',
};

export function StoryFormPage() {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const { stories, categories, loading, saveStory } = useStories();
  const [formData, setFormData] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingPageIndex, setUploadingPageIndex] = useState(null);
  const [coverProgress, setCoverProgress] = useState(0);
  const [pageUploadProgress, setPageUploadProgress] = useState(0);
  const [draggedPageIndex, setDraggedPageIndex] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  const isEditing = Boolean(storyId);
  const existingStory = useMemo(() => stories.find((story) => story.id === storyId) || null, [stories, storyId]);

  useEffect(() => {
    if (isEditing && existingStory) {
      setFormData({
        title: existingStory.title || '',
        category: existingStory.category || '',
        ageGroup: existingStory.ageGroup || '',
        readingTime: existingStory.readingTime || existingStory.readTime || '',
        language: existingStory.language || 'English',
        description: existingStory.description || existingStory.summary || '',
        moral: existingStory.moral || '',
        coverImage: existingStory.coverImage || existingStory.coverImageUrl || '',
        music: existingStory.music || existingStory.backgroundMusicUrl || '',
        pages: existingStory.pages?.length
          ? existingStory.pages.map((page, index) => ({
              id: page.id || `${Date.now()}-${index}`,
              imageUrl: page.imageUrl || '',
              text: page.text || '',
            }))
          : [createPage()],
        isPremium: Boolean(existingStory.isPremium ?? existingStory.premium),
        isFeatured: Boolean(existingStory.isFeatured ?? existingStory.featured),
        status: existingStory.status || 'draft',
      });
      return;
    }

    setFormData(emptyForm);
  }, [existingStory, isEditing]);

  const validate = () => {
    const nextErrors = {};

    if (!formData.title.trim()) nextErrors.title = 'Title is required.';
    if (!formData.category.trim()) nextErrors.category = 'Category is required.';
    if (!formData.ageGroup.trim()) nextErrors.ageGroup = 'Age group is required.';
    if (!formData.readingTime.trim()) nextErrors.readingTime = 'Reading time is required.';
    if (!formData.description.trim()) nextErrors.description = 'Description is required.';
    if (formData.coverImage && !/^https?:\/\//i.test(formData.coverImage)) {
      nextErrors.coverImage = 'Cover image URL must be a valid HTTP URL.';
    }
    if (formData.music && !/^https?:\/\//i.test(formData.music)) {
      nextErrors.music = 'Music URL must be a valid HTTP URL.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleCoverUpload = async (file) => {
    if (!file) {
      return;
    }

    setUploadingCover(true);
    setCoverProgress(0);

    try {
      const activeStoryId = storyId || `story_${Date.now()}`;
      const url = await uploadImageFile(
        file,
        'stories',
        (progress) => setCoverProgress(progress),
        activeStoryId,
        formData.coverImage
      );
      setFormData((current) => ({ ...current, coverImage: url }));
    } finally {
      setUploadingCover(false);
      setCoverProgress(0);
    }
  };

  const handlePageImageUpload = async (pageIndex, file) => {
    if (!file) {
      return;
    }

    setUploadingPageIndex(pageIndex);
    setPageUploadProgress(0);

    try {
      const activeStoryId = storyId || `story_${Date.now()}`;
      const url = await uploadImageFile(
        file,
        'stories',
        (progress) => setPageUploadProgress(progress),
        activeStoryId,
        formData.pages[pageIndex]?.imageUrl || ''
      );
      setFormData((current) => ({
        ...current,
        pages: current.pages.map((page, index) => (index === pageIndex ? { ...page, imageUrl: url } : page)),
      }));
    } finally {
      setUploadingPageIndex(null);
      setPageUploadProgress(0);
    }
  };

  const handlePageImageDrop = async (event, pageIndex) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer?.files?.[0];
    if (file) {
      await handlePageImageUpload(pageIndex, file);
    }
  };

  const handleFileChange = async (event, type, pageIndex) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (type === 'cover') {
      await handleCoverUpload(file);
      return;
    }

    await handlePageImageUpload(pageIndex, file);
    event.target.value = '';
  };

  const addPage = () => {
    setFormData((current) => ({ ...current, pages: [...current.pages, createPage()] }));
  };

  const removePage = (pageIndex) => {
    setFormData((current) => {
      if (current.pages.length === 1) {
        return { ...current, pages: [createPage()] };
      }

      return {
        ...current,
        pages: current.pages.filter((_, index) => index !== pageIndex),
      };
    });
  };

  const movePage = (fromIndex, toIndex) => {
    setFormData((current) => {
      const pages = [...current.pages];
      const [movedPage] = pages.splice(fromIndex, 1);
      pages.splice(toIndex, 0, movedPage);
      return { ...current, pages };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      const payload = {
        storyId: storyId || existingStory?.storyId || existingStory?.id || '',
        title: formData.title.trim(),
        category: formData.category.trim(),
        ageGroup: formData.ageGroup.trim(),
        readingTime: formData.readingTime.trim(),
        language: formData.language.trim(),
        description: formData.description.trim(),
        moral: formData.moral.trim(),
        coverImage: formData.coverImage.trim(),
        music: formData.music.trim(),
        pages: formData.pages.map((page) => ({ imageUrl: page.imageUrl, text: page.text })),
        isPremium: formData.isPremium,
        isFeatured: formData.isFeatured,
        status: formData.status,
      };

      await saveStory(payload, storyId);
      setSubmitSuccess('Story saved successfully.');
      navigate('/stories');
    } catch (error) {
      setSubmitError(error.message || 'Unable to save the story. Please check the Firebase connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-shell">
      <SidebarNav />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Content</p>
            <h1>{isEditing ? 'Edit Story' : 'Add Story'}</h1>
          </div>
          <button className="secondary-btn" type="button" onClick={() => navigate('/stories')}>
            Back to Stories
          </button>
        </header>

        {loading ? (
          <div className="empty-state">Loading story form…</div>
        ) : (
          <section className="panel-card">
            <form className="story-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="field">
                  <span>Title</span>
                  <input
                    value={formData.title}
                    onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))}
                  />
                  {errors.title ? <small className="field-error">{errors.title}</small> : null}
                </label>

                <label className="field">
                  <span>Category</span>
                  <input
                    value={formData.category}
                    onChange={(event) => setFormData((current) => ({ ...current, category: event.target.value }))}
                  />
                  {errors.category ? <small className="field-error">{errors.category}</small> : null}
                </label>

                <label className="field">
                  <span>Age Group</span>
                  <input
                    value={formData.ageGroup}
                    onChange={(event) => setFormData((current) => ({ ...current, ageGroup: event.target.value }))}
                  />
                  {errors.ageGroup ? <small className="field-error">{errors.ageGroup}</small> : null}
                </label>

                <label className="field">
                  <span>Reading Time</span>
                  <input
                    value={formData.readingTime}
                    onChange={(event) => setFormData((current) => ({ ...current, readingTime: event.target.value }))}
                  />
                  {errors.readingTime ? <small className="field-error">{errors.readingTime}</small> : null}
                </label>
              </div>

              <label className="field">
                <span>Description</span>
                <textarea
                  rows="5"
                  value={formData.description}
                  onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))}
                />
                {errors.description ? <small className="field-error">{errors.description}</small> : null}
              </label>

              <div className="form-grid">
                <label className="field">
                  <span>Language</span>
                  <input
                    value={formData.language}
                    onChange={(event) => setFormData((current) => ({ ...current, language: event.target.value }))}
                  />
                </label>

                <label className="field">
                  <span>Moral (optional)</span>
                  <input
                    value={formData.moral}
                    onChange={(event) => setFormData((current) => ({ ...current, moral: event.target.value }))}
                  />
                </label>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>Cover Image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleFileChange(event, 'cover')}
                  />
                  {uploadingCover ? <small>Uploading cover… {coverProgress}%</small> : null}
                  {formData.coverImage ? (
                    <div className="preview-box">
                      <img src={formData.coverImage} alt="Cover preview" />
                    </div>
                  ) : null}
                  {errors.coverImage ? <small className="field-error">{errors.coverImage}</small> : null}
                </label>

                <label className="field">
                  <span>Music URL</span>
                  <input
                    value={formData.music}
                    onChange={(event) => setFormData((current) => ({ ...current, music: event.target.value }))}
                  />
                  {errors.music ? <small className="field-error">{errors.music}</small> : null}
                </label>
              </div>

              <div className="page-editor-section">
                <div className="panel-header compact-header">
                  <h3>Story Pages</h3>
                  <button className="secondary-btn" type="button" onClick={addPage}>
                    Add Page
                  </button>
                </div>

                {formData.pages.map((page, index) => (
                  <div
                    key={page.id}
                    className="page-editor-card"
                    draggable
                    onDragStart={() => setDraggedPageIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedPageIndex !== null && draggedPageIndex !== index) {
                        movePage(draggedPageIndex, index);
                      }
                      setDraggedPageIndex(null);
                    }}
                  >
                    <div className="page-editor-header">
                      <strong>Page {index + 1}</strong>
                      <div className="page-editor-actions">
                        <button className="ghost-btn" type="button" onClick={() => removePage(index)}>
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="form-grid">
                      <label className="field">
                        <span>Image</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => handleFileChange(event, 'page', index)}
                          onDrop={(event) => handlePageImageDrop(event, index)}
                        />
                        {uploadingPageIndex === index ? <small>Uploading page {index + 1}… {pageUploadProgress}%</small> : null}
                        {page.imageUrl ? (
                          <div className="preview-box">
                            <img src={page.imageUrl} alt={`Page ${index + 1} preview`} />
                          </div>
                        ) : null}
                      </label>

                      <label className="field">
                        <span>Story Text</span>
                        <textarea
                          rows="5"
                          value={page.text}
                          onChange={(event) =>
                            setFormData((current) => ({
                              ...current,
                              pages: current.pages.map((currentPage, currentIndex) =>
                                currentIndex === index ? { ...currentPage, text: event.target.value } : currentPage
                              ),
                            }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="form-grid checkbox-grid">
                <label className="field checkbox-row">
                  <input
                    type="checkbox"
                    checked={formData.isPremium}
                    onChange={(event) => setFormData((current) => ({ ...current, isPremium: event.target.checked }))}
                  />
                  <span>Premium</span>
                </label>

                <label className="field checkbox-row">
                  <input
                    type="checkbox"
                    checked={formData.isFeatured}
                    onChange={(event) => setFormData((current) => ({ ...current, isFeatured: event.target.checked }))}
                  />
                  <span>Featured</span>
                </label>

                <label className="field">
                  <span>Status</span>
                  <select
                    value={formData.status}
                    onChange={(event) => setFormData((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </label>
              </div>

              {submitError ? <small className="field-error">{submitError}</small> : null}
              {submitSuccess ? <small className="field-success">{submitSuccess}</small> : null}

              <div className="modal-actions">
                <button className="secondary-btn" type="button" onClick={() => navigate('/stories')}>
                  Cancel
                </button>
                <button className="primary-btn" type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Story'}
                </button>
              </div>
            </form>
          </section>
        )}
      </main>
    </div>
  );
}
