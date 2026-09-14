import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { SidebarNav } from '../components/SidebarNav';
import { useStories } from '../hooks/useStories';
import { getStory } from '../services/storyService';
import { deleteAssets, uploadImageFile } from '../services/storageService';

const createPage = () => ({
  id: crypto.randomUUID(),
  persistedId: '',
  imageKey: '',
  imageUrl: '',
  text: '',
});

const createEmptyForm = () => ({
  id: crypto.randomUUID(),
  version: 0,
  title: '',
  slug: '',
  categoryId: '',
  ageGroup: '',
  readingTime: '',
  languageId: '',
  description: '',
  moral: '',
  coverImageKey: '',
  coverImage: '',
  musicKey: '',
  music: '',
  pages: [createPage()],
  isPremium: false,
  isFeatured: false,
  status: 'draft',
});

const createStoryForm = (story) => {
  if (!story) return createEmptyForm();

  return {
    id: story.id,
    version: story.version || 1,
    title: story.title || '',
    slug: story.slug || '',
    categoryId: story.categoryId || '',
    ageGroup: story.ageGroup || '',
    readingTime: story.readingTime || '',
    languageId: story.languageId || '',
    description: story.description || '',
    moral: story.moral || '',
    coverImageKey: story.coverImageKey || '',
    coverImage: story.coverImage || '',
    musicKey: story.musicKey || '',
    music: story.music || '',
    pages: story.pages?.length
      ? story.pages.map((page) => ({
          id: page.id || crypto.randomUUID(),
          persistedId: page.id || '',
          imageKey: page.imageKey || '',
          imageUrl: page.imageUrl || '',
          text: page.text || '',
        }))
      : [createPage()],
    isPremium: Boolean(story.isPremium),
    isFeatured: Boolean(story.isFeatured),
    status: story.status || 'draft',
  };
};

const getImageKeys = (story) => new Set([
  story?.coverImageKey,
  ...(story?.pages || []).map((page) => page.imageKey),
].filter(Boolean));

const hasExpectedImageReferences = (form, story) => {
  if (!story || (form.coverImageKey || '') !== (story.coverImageKey || '')) return false;
  const expectedPageKeys = (form.pages || []).map((page) => page.imageKey || '');
  const persistedPageKeys = (story.pages || []).map((page) => page.imageKey || '');
  return expectedPageKeys.length === persistedPageKeys.length
    && expectedPageKeys.every((key, index) => key === persistedPageKeys[index]);
};

export function StoryFormPage() {
  const { storyId } = useParams();
  const { stories, categories, languages, loading, saveStory } = useStories();
  const existingStory = stories.find((story) => story.id === storyId) || null;

  if (storyId && !loading && !existingStory) {
    return (
      <div className="app-shell">
        <SidebarNav />
        <main className="main-panel">
          <div className="empty-state">
            This story was not found, or your account cannot read it.
          </div>
        </main>
      </div>
    );
  }

  const formKey = storyId ? existingStory?.id || `${storyId}:loading` : 'new';
  return (
    <StoryFormPageContent
      key={formKey}
      storyId={storyId}
      existingStory={existingStory}
      categories={categories}
      languages={languages}
      loading={loading}
      saveStory={saveStory}
    />
  );
}

function StoryFormPageContent({ storyId, existingStory, categories, languages, loading, saveStory }) {
  const navigate = useNavigate();
  const initialForm = createStoryForm(existingStory);
  const originalFormRef = useRef(initialForm);
  const pendingUploadKeys = useRef(new Set());
  const replacedAssetKeys = useRef(new Set());
  const uploadInFlight = useRef(false);
  const saveOutcomeUncertain = useRef(false);
  const [formData, setFormData] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [activeUpload, setActiveUpload] = useState(null);
  const [draggedPageIndex, setDraggedPageIndex] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  const isEditing = Boolean(storyId);
  const isUploading = Boolean(activeUpload);
  const formActionsLocked = submitting || isUploading;

  const validate = () => {
    const nextErrors = {};
    if (!formData.title.trim()) nextErrors.title = 'Title is required.';
    if (!formData.slug.trim() && !formData.title.trim()) {
      nextErrors.slug = 'Slug is required.';
    }
    if (!formData.categoryId) nextErrors.categoryId = 'Category is required.';
    if (!formData.languageId) nextErrors.languageId = 'Language is required.';
    if (!formData.ageGroup.trim()) nextErrors.ageGroup = 'Age group is required.';
    if (!Number.isInteger(Number(formData.readingTime)) || Number(formData.readingTime) < 1) {
      nextErrors.readingTime = 'Reading time must be a positive whole number.';
    }
    if (!formData.description.trim()) nextErrors.description = 'Description is required.';
    if (formData.coverImage && !/^https:\/\//i.test(formData.coverImage)) {
      nextErrors.coverImage = 'Cover image must use an HTTPS URL.';
    }
    if (formData.music && !/^https:\/\//i.test(formData.music)) {
      nextErrors.music = 'Music URL must use HTTPS.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const registerReplacement = (oldKey, newKey) => {
    pendingUploadKeys.current.add(newKey);
    if (oldKey && oldKey !== newKey) replacedAssetKeys.current.add(oldKey);
  };

  const updateUploadProgress = (progress) => {
    setActiveUpload((current) => current ? { ...current, progress } : current);
  };

  const handleCoverUpload = async (file) => {
    if (!file || uploadInFlight.current || submitting) return;
    uploadInFlight.current = true;
    setActiveUpload({ type: 'cover', progress: 0 });
    setSubmitError('');

    try {
      const asset = await uploadImageFile(file, {
        assetType: 'cover',
        storyPathId: formData.id,
        onProgress: updateUploadProgress,
      });
      registerReplacement(formData.coverImageKey, asset.key);
      setFormData((current) => ({
        ...current,
        coverImageKey: asset.key,
        coverImage: asset.url,
      }));
    } catch (error) {
      setSubmitError(error.message || 'Unable to upload the cover image.');
    } finally {
      uploadInFlight.current = false;
      setActiveUpload(null);
    }
  };

  const handlePageImageUpload = async (pageId, file) => {
    if (!file || uploadInFlight.current || submitting) return;
    const pageIndex = formData.pages.findIndex((page) => page.id === pageId);
    if (pageIndex < 0) return;
    const previousKey = formData.pages[pageIndex]?.imageKey;
    uploadInFlight.current = true;
    setActiveUpload({ type: 'page', pageId, progress: 0 });
    setSubmitError('');

    try {
      const asset = await uploadImageFile(file, {
        assetType: 'page',
        storyPathId: formData.id,
        onProgress: updateUploadProgress,
      });
      registerReplacement(previousKey, asset.key);
      setFormData((current) => ({
        ...current,
        pages: current.pages.map((page) =>
          page.id === pageId ? { ...page, imageKey: asset.key, imageUrl: asset.url } : page
        ),
      }));
    } catch (error) {
      setSubmitError(error.message || `Unable to upload the image for page ${pageIndex + 1}.`);
    } finally {
      uploadInFlight.current = false;
      setActiveUpload(null);
    }
  };

  const handlePageImageDrop = async (event, pageId) => {
    event.preventDefault();
    event.stopPropagation();
    if (formActionsLocked) return;
    const file = event.dataTransfer?.files?.[0];
    if (file) await handlePageImageUpload(pageId, file);
  };

  const handleFileChange = async (event, type, pageId) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (type === 'cover') await handleCoverUpload(file);
    else await handlePageImageUpload(pageId, file);
  };

  const addPage = () => {
    if (formActionsLocked) return;
    setFormData((current) => ({ ...current, pages: [...current.pages, createPage()] }));
  };

  const removePage = (pageIndex) => {
    if (formActionsLocked) return;
    const removedKey = formData.pages[pageIndex]?.imageKey;
    if (removedKey) replacedAssetKeys.current.add(removedKey);
    setFormData((current) => ({
      ...current,
      pages: current.pages.length === 1
        ? [createPage()]
        : current.pages.filter((_, index) => index !== pageIndex),
    }));
  };

  const movePage = (fromIndex, toIndex) => {
    if (formActionsLocked) return;
    setFormData((current) => {
      const pages = [...current.pages];
      const [movedPage] = pages.splice(fromIndex, 1);
      pages.splice(toIndex, 0, movedPage);
      return { ...current, pages };
    });
  };

  const clearCoverImage = () => {
    if (formActionsLocked) return;
    if (formData.coverImageKey) replacedAssetKeys.current.add(formData.coverImageKey);
    setFormData((current) => ({ ...current, coverImageKey: '', coverImage: '' }));
  };

  const clearPageImage = (pageId) => {
    if (formActionsLocked) return;
    const currentPage = formData.pages.find((page) => page.id === pageId);
    if (currentPage?.imageKey) replacedAssetKeys.current.add(currentPage.imageKey);
    setFormData((current) => ({
      ...current,
      pages: current.pages.map((page) => (
        page.id === pageId ? { ...page, imageKey: '', imageUrl: '' } : page
      )),
    }));
  };

  const resetUploadedAssets = (cleanedKeys, persistedStory = null) => {
    const fallback = persistedStory ? createStoryForm(persistedStory) : originalFormRef.current;
    setFormData((current) => ({
      ...current,
      coverImageKey: cleanedKeys.has(current.coverImageKey) ? fallback.coverImageKey : current.coverImageKey,
      coverImage: cleanedKeys.has(current.coverImageKey) ? fallback.coverImage : current.coverImage,
      pages: current.pages.map((page, index) => {
        if (!cleanedKeys.has(page.imageKey)) return page;
        const originalPage = fallback.pages.find((candidate) => candidate.persistedId && candidate.persistedId === page.persistedId)
          || fallback.pages[index];
        return {
          ...page,
          imageKey: originalPage?.imageKey || '',
          imageUrl: originalPage?.imageUrl || '',
        };
      }),
    }));
  };

  const cleanPendingUploads = async () => {
    const keys = [...pendingUploadKeys.current];
    if (keys.length) await deleteAssets(keys);
    pendingUploadKeys.current.clear();
    replacedAssetKeys.current.clear();
  };

  const handleCancel = async () => {
    if (formActionsLocked) return;
    if (!saveOutcomeUncertain.current) {
      try {
        await cleanPendingUploads();
      } catch {
        // A bucket lifecycle rule can remove an upload orphaned by failed cleanup.
      }
    }
    navigate('/stories', saveOutcomeUncertain.current ? {
      state: { notice: 'Some uploaded images were retained because the previous save outcome could not be verified safely.' },
    } : undefined);
  };

  const finishAssetCommit = async (savedStory) => {
    const referencedKeys = getImageKeys(savedStory);
    const cleanupKeys = [...new Set([
      ...replacedAssetKeys.current,
      ...pendingUploadKeys.current,
    ])].filter((key) => !referencedKeys.has(key));

    pendingUploadKeys.current.clear();
    replacedAssetKeys.current.clear();
    saveOutcomeUncertain.current = false;

    if (!cleanupKeys.length) return '';
    try {
      await deleteAssets(cleanupKeys);
      return '';
    } catch (error) {
      return `The story was saved, but obsolete R2 images require cleanup: ${error.message}`;
    }
  };

  const reconcileFailedSave = async () => {
    let persistedStory;
    try {
      persistedStory = await getStory(formData.id);
    } catch {
      saveOutcomeUncertain.current = true;
      return { committed: false, uncertain: true };
    }

    if (hasExpectedImageReferences(formData, persistedStory)) {
      const cleanupWarning = await finishAssetCommit(persistedStory);
      return { committed: true, cleanupWarning };
    }

    saveOutcomeUncertain.current = false;
    const persistedKeys = getImageKeys(persistedStory);
    const safeCleanupKeys = [...pendingUploadKeys.current].filter((key) => !persistedKeys.has(key));
    if (safeCleanupKeys.length) {
      try {
        await deleteAssets(safeCleanupKeys);
        const cleanedKeys = new Set(safeCleanupKeys);
        safeCleanupKeys.forEach((key) => pendingUploadKeys.current.delete(key));
        resetUploadedAssets(cleanedKeys, persistedStory);
      } catch {
        // Keep failed cleanup keys tracked so cancel or a later save can retry them.
      }
    }

    return { committed: false, uncertain: false };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;
    if (uploadInFlight.current || isUploading) {
      setSubmitError('Wait for all image uploads to finish before saving.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      const savedStory = await saveStory(formData, storyId);
      const cleanupWarning = await finishAssetCommit(savedStory);
      navigate('/stories', cleanupWarning ? { state: { notice: cleanupWarning } } : undefined);
    } catch (error) {
      const hasAssetChanges = pendingUploadKeys.current.size > 0 || replacedAssetKeys.current.size > 0;
      const reconciliation = hasAssetChanges
        ? await reconcileFailedSave()
        : { committed: false, uncertain: false };

      if (reconciliation.committed) {
        navigate('/stories', reconciliation.cleanupWarning
          ? { state: { notice: reconciliation.cleanupWarning } }
          : undefined);
        return;
      }

      const baseMessage = error.message || 'Unable to save the story. Check Supabase access and try again.';
      setSubmitError(reconciliation.uncertain
        ? `${baseMessage} Uploaded images were retained because the database outcome could not be verified safely.`
        : baseMessage);
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
          <button className="secondary-btn" type="button" onClick={handleCancel} disabled={formActionsLocked}>
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
                  <input value={formData.title} onChange={(event) => setFormData((current) => ({ ...current, title: event.target.value }))} />
                  {errors.title ? <small className="field-error">{errors.title}</small> : null}
                </label>

                <label className="field">
                  <span>Slug</span>
                  <input
                    value={formData.slug}
                    onChange={(event) => setFormData((current) => ({ ...current, slug: event.target.value }))}
                    placeholder="autosaves from title"
                  />
                  {errors.slug ? <small className="field-error">{errors.slug}</small> : null}
                </label>

                <label className="field">
                  <span>Category</span>
                  <select value={formData.categoryId} onChange={(event) => setFormData((current) => ({ ...current, categoryId: event.target.value }))}>
                    <option value="">Select a category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}{category.is_active ? '' : ' (inactive)'}</option>
                    ))}
                  </select>
                  {errors.categoryId ? <small className="field-error">{errors.categoryId}</small> : null}
                </label>

                <label className="field">
                  <span>Age Group</span>
                  <input value={formData.ageGroup} onChange={(event) => setFormData((current) => ({ ...current, ageGroup: event.target.value }))} placeholder="4-6" />
                  {errors.ageGroup ? <small className="field-error">{errors.ageGroup}</small> : null}
                </label>

                <label className="field">
                  <span>Reading Time (minutes)</span>
                  <input type="number" min="1" step="1" value={formData.readingTime} onChange={(event) => setFormData((current) => ({ ...current, readingTime: event.target.value }))} />
                  {errors.readingTime ? <small className="field-error">{errors.readingTime}</small> : null}
                </label>
              </div>

              <label className="field">
                <span>Description</span>
                <textarea rows="5" value={formData.description} onChange={(event) => setFormData((current) => ({ ...current, description: event.target.value }))} />
                {errors.description ? <small className="field-error">{errors.description}</small> : null}
              </label>

              <div className="form-grid">
                <label className="field">
                  <span>Language</span>
                  <select value={formData.languageId} onChange={(event) => setFormData((current) => ({ ...current, languageId: event.target.value }))}>
                    <option value="">Select a language</option>
                    {languages.map((language) => (
                      <option key={language.id} value={language.id}>{language.name}{language.is_active ? '' : ' (inactive)'}</option>
                    ))}
                  </select>
                  {errors.languageId ? <small className="field-error">{errors.languageId}</small> : null}
                </label>

                <label className="field">
                  <span>Moral (optional)</span>
                  <input value={formData.moral} onChange={(event) => setFormData((current) => ({ ...current, moral: event.target.value }))} />
                </label>
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>Cover Image</span>
                  <input type="file" accept="image/avif,image/jpeg,image/png,image/webp" disabled={formActionsLocked} onChange={(event) => handleFileChange(event, 'cover')} />
                  {activeUpload?.type === 'cover' ? <small>Uploading cover… {activeUpload.progress}%</small> : null}
                  {formData.coverImage ? <div className="preview-box"><img src={formData.coverImage} alt="Cover preview" /></div> : null}
                  {formData.coverImage ? <button className="ghost-btn" type="button" disabled={formActionsLocked} onClick={clearCoverImage}>Remove cover image</button> : null}
                  {errors.coverImage ? <small className="field-error">{errors.coverImage}</small> : null}
                </label>

                <label className="field">
                  <span>Music URL</span>
                  <input type="url" value={formData.music} onChange={(event) => setFormData((current) => ({ ...current, music: event.target.value }))} placeholder="https://" />
                  {errors.music ? <small className="field-error">{errors.music}</small> : null}
                </label>
              </div>

              <div className="page-editor-section">
                <div className="panel-header compact-header">
                  <h3>Story Pages</h3>
                  <button className="secondary-btn" type="button" onClick={addPage} disabled={formActionsLocked}>Add Page</button>
                </div>

                {formData.pages.map((page, index) => (
                  <div
                    key={page.id}
                    className="page-editor-card"
                    draggable={!formActionsLocked}
                    onDragStart={() => setDraggedPageIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedPageIndex !== null && draggedPageIndex !== index) movePage(draggedPageIndex, index);
                      setDraggedPageIndex(null);
                    }}
                  >
                    <div className="page-editor-header">
                      <strong>Page {index + 1}</strong>
                      <button className="ghost-btn" type="button" disabled={formActionsLocked} onClick={() => removePage(index)}>Remove</button>
                    </div>

                    <div className="form-grid">
                      <label className="field">
                        <span>Image</span>
                        <input
                          type="file"
                          accept="image/avif,image/jpeg,image/png,image/webp"
                          disabled={formActionsLocked}
                          onChange={(event) => handleFileChange(event, 'page', page.id)}
                          onDrop={(event) => handlePageImageDrop(event, page.id)}
                        />
                        {activeUpload?.type === 'page' && activeUpload.pageId === page.id ? <small>Uploading page {index + 1}… {activeUpload.progress}%</small> : null}
                        {page.imageUrl ? <div className="preview-box"><img src={page.imageUrl} alt={`Page ${index + 1} preview`} /></div> : null}
                        {page.imageUrl ? <button className="ghost-btn" type="button" disabled={formActionsLocked} onClick={() => clearPageImage(page.id)}>Remove page image</button> : null}
                      </label>

                      <label className="field">
                        <span>Story Text</span>
                        <textarea
                          rows="5"
                          value={page.text}
                          onChange={(event) => setFormData((current) => ({
                            ...current,
                            pages: current.pages.map((currentPage, currentIndex) =>
                              currentIndex === index ? { ...currentPage, text: event.target.value } : currentPage
                            ),
                          }))}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="form-grid checkbox-grid">
                <label className="field checkbox-row">
                  <input type="checkbox" checked={formData.isPremium} onChange={(event) => setFormData((current) => ({ ...current, isPremium: event.target.checked }))} />
                  <span>Premium</span>
                </label>
                <label className="field checkbox-row">
                  <input type="checkbox" checked={formData.isFeatured} onChange={(event) => setFormData((current) => ({ ...current, isFeatured: event.target.checked }))} />
                  <span>Featured</span>
                </label>
                <label className="field">
                  <span>Status</span>
                  <select value={formData.status} onChange={(event) => setFormData((current) => ({ ...current, status: event.target.value }))}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </label>
              </div>

              {submitError ? <p className="form-error">{submitError}</p> : null}
              {submitSuccess ? <p className="field-success">{submitSuccess}</p> : null}

              <div className="modal-actions">
                <button className="secondary-btn" type="button" onClick={handleCancel} disabled={formActionsLocked}>Cancel</button>
                <button className="primary-btn" type="submit" disabled={formActionsLocked}>
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
