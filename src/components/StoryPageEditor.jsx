export function StoryPageEditor({ pages, onPagesChange }) {
  const updatePage = (index, field, value) => {
    const nextPages = pages.map((page, pageIndex) =>
      pageIndex === index ? { ...page, [field]: value } : page
    );
    onPagesChange(nextPages);
  };

  const addPage = () => {
    const nextPages = [
      ...pages,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        page: pages.length + 1,
        image: '',
        text: '',
      },
    ];
    onPagesChange(nextPages);
  };

  const removePage = (index) => {
    if (pages.length === 1) {
      return;
    }

    const nextPages = pages.filter((_, pageIndex) => pageIndex !== index).map((page, pageIndex) => ({ ...page, page: pageIndex + 1 }));
    onPagesChange(nextPages);
  };

  const duplicatePage = (index) => {
    const pageToCopy = pages[index];
    const nextPages = [
      ...pages,
      {
        ...pageToCopy,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        page: pages.length + 1,
      },
    ];
    onPagesChange(nextPages);
  };

  const movePage = (index, direction) => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= pages.length) {
      return;
    }

    const nextPages = [...pages];
    const [movedPage] = nextPages.splice(index, 1);
    nextPages.splice(targetIndex, 0, movedPage);
    onPagesChange(nextPages.map((page, pageIndex) => ({ ...page, page: pageIndex + 1 })));
  };

  return (
    <div className="page-editor-section">
      <div className="panel-header compact-header">
        <h3>Story Pages</h3>
        <button className="secondary-btn" type="button" onClick={addPage}>
          Add Page
        </button>
      </div>

      {pages.map((page, index) => (
        <div key={page.id || `${page.page}-${index}`} className="page-editor-card">
          <div className="page-editor-header">
            <strong>Page {index + 1}</strong>
            <div className="page-editor-actions">
              <button className="ghost-btn" type="button" onClick={() => movePage(index, 'up')} disabled={index === 0}>
                Move Up
              </button>
              <button className="ghost-btn" type="button" onClick={() => movePage(index, 'down')} disabled={index === pages.length - 1}>
                Move Down
              </button>
              <button className="ghost-btn" type="button" onClick={() => duplicatePage(index)}>
                Duplicate
              </button>
              <button className="ghost-btn" type="button" onClick={() => removePage(index)} disabled={pages.length === 1}>
                Delete
              </button>
            </div>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Image URL</span>
              <input
                value={page.image || ''}
                onChange={(event) => updatePage(index, 'image', event.target.value)}
                placeholder="https://example.com/page-image.jpg"
              />
            </label>

            <label className="field">
              <span>Story Text</span>
              <textarea
                rows="5"
                value={page.text || ''}
                onChange={(event) => updatePage(index, 'text', event.target.value)}
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
