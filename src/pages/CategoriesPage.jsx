import { useCallback, useEffect, useState } from 'react';
import { SidebarNav } from '../components/SidebarNav';
import { deleteCategory, getCategories, saveCategory } from '../services/catalogService';

const emptyCategory = {
  id: '',
  name: '',
  slug: '',
  description: '',
  sort_order: 0,
  is_active: true,
};

export function CategoriesPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyCategory);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const categories = await getCategories();
      setItems(categories);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Unable to load categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadCategories();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadCategories]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      await saveCategory(form);
      setForm(emptyCategory);
      await loadCategories();
    } catch (submitError) {
      setError(submitError.message || 'Unable to save the category.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (category) => {
    setForm({
      id: category.id,
      name: category.name || '',
      slug: category.slug || '',
      description: category.description || '',
      sort_order: category.sort_order ?? 0,
      is_active: category.is_active !== false,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this category?')) return;

    try {
      await deleteCategory(id);
      if (form.id === id) {
        setForm(emptyCategory);
      }
      await loadCategories();
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete the category.');
    }
  };

  return (
    <div className="app-shell">
      <SidebarNav />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Catalog</p>
            <h1>Categories</h1>
          </div>
        </header>

        <div className="catalog-grid">
          <section className="panel-card">
            <div className="panel-header">
              <h3>{form.id ? 'Edit category' : 'New category'}</h3>
              {form.id ? (
                <button type="button" className="secondary-btn" onClick={() => setForm(emptyCategory)}>
                  Cancel
                </button>
              ) : null}
            </div>

            <form className="catalog-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Name</span>
                <input
                  name="name"
                  type="text"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Adventure"
                  required
                />
              </label>

              <label className="field">
                <span>Slug</span>
                <input
                  name="slug"
                  type="text"
                  value={form.slug}
                  onChange={handleChange}
                  placeholder="adventure"
                />
              </label>

              <label className="field">
                <span>Description</span>
                <textarea
                  name="description"
                  rows="4"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Optional description"
                />
              </label>

              <div className="field-row">
                <label className="field compact-field">
                  <span>Sort order</span>
                  <input
                    name="sort_order"
                    type="number"
                    min="0"
                    value={form.sort_order}
                    onChange={handleChange}
                  />
                </label>
              </div>

              <label className="checkbox-row">
                <input
                  name="is_active"
                  type="checkbox"
                  checked={form.is_active}
                  onChange={handleChange}
                />
                Active
              </label>

              {error ? <p className="inline-error">{error}</p> : null}

              <button className="primary-btn" type="submit" disabled={saving}>
                {saving ? 'Saving...' : form.id ? 'Update category' : 'Create category'}
              </button>
            </form>
          </section>

          <section className="panel-card">
            <div className="panel-header">
              <h3>Existing categories</h3>
            </div>

            {loading ? <p className="muted-text">Loading categories...</p> : null}

            {!loading && !items.length ? (
              <p className="muted-text">No categories have been created yet.</p>
            ) : null}

            {!loading && items.length ? (
              <ul className="catalog-list">
                {items.map((category) => (
                  <li key={category.id}>
                    <div>
                      <strong>{category.name}</strong>
                      <p>{category.description || 'No description'}</p>
                      <small>{category.is_active ? 'Active' : 'Inactive'} • #{category.sort_order}</small>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="secondary-btn small-btn" onClick={() => handleEdit(category)}>
                        Edit
                      </button>
                      <button type="button" className="secondary-btn small-btn danger-btn" onClick={() => handleDelete(category.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
