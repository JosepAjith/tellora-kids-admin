import { useCallback, useEffect, useState } from 'react';
import { SidebarNav } from '../components/SidebarNav';
import { deleteLanguage, getLanguages, saveLanguage } from '../services/catalogService';

const emptyLanguage = {
  id: '',
  code: '',
  name: '',
  native_name: '',
  is_active: true,
};

export function LanguagesPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyLanguage);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadLanguages = useCallback(async () => {
    setLoading(true);
    try {
      const languages = await getLanguages();
      setItems(languages);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Unable to load languages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadLanguages();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadLanguages]);

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
      await saveLanguage(form);
      setForm(emptyLanguage);
      await loadLanguages();
    } catch (submitError) {
      setError(submitError.message || 'Unable to save the language.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (language) => {
    setForm({
      id: language.id,
      code: language.code || '',
      name: language.name || '',
      native_name: language.native_name || '',
      is_active: language.is_active !== false,
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this language?')) return;

    try {
      await deleteLanguage(id);
      if (form.id === id) {
        setForm(emptyLanguage);
      }
      await loadLanguages();
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete the language.');
    }
  };

  return (
    <div className="app-shell">
      <SidebarNav />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Catalog</p>
            <h1>Languages</h1>
          </div>
        </header>

        <div className="catalog-grid">
          <section className="panel-card">
            <div className="panel-header">
              <h3>{form.id ? 'Edit language' : 'New language'}</h3>
              {form.id ? (
                <button type="button" className="secondary-btn" onClick={() => setForm(emptyLanguage)}>
                  Cancel
                </button>
              ) : null}
            </div>

            <form className="catalog-form" onSubmit={handleSubmit}>
              <div className="field-row">
                <label className="field compact-field">
                  <span>Code</span>
                  <input
                    name="code"
                    type="text"
                    value={form.code}
                    onChange={handleChange}
                    placeholder="en"
                    required
                  />
                </label>
                <label className="field compact-field">
                  <span>Name</span>
                  <input
                    name="name"
                    type="text"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="English"
                    required
                  />
                </label>
              </div>

              <label className="field">
                <span>Native name</span>
                <input
                  name="native_name"
                  type="text"
                  value={form.native_name}
                  onChange={handleChange}
                  placeholder="English"
                />
              </label>

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
                {saving ? 'Saving...' : form.id ? 'Update language' : 'Create language'}
              </button>
            </form>
          </section>

          <section className="panel-card">
            <div className="panel-header">
              <h3>Existing languages</h3>
            </div>

            {loading ? <p className="muted-text">Loading languages...</p> : null}

            {!loading && !items.length ? (
              <p className="muted-text">No languages have been created yet.</p>
            ) : null}

            {!loading && items.length ? (
              <ul className="catalog-list">
                {items.map((language) => (
                  <li key={language.id}>
                    <div>
                      <strong>{language.name}</strong>
                      <p>{language.native_name || 'No native name'} • {language.code}</p>
                      <small>{language.is_active ? 'Active' : 'Inactive'}</small>
                    </div>
                    <div className="row-actions">
                      <button type="button" className="secondary-btn small-btn" onClick={() => handleEdit(language)}>
                        Edit
                      </button>
                      <button type="button" className="secondary-btn small-btn danger-btn" onClick={() => handleDelete(language.id)}>
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
