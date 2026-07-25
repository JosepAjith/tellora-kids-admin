import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SidebarNav } from '../components/SidebarNav';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useStories } from '../hooks/useStories';

const PAGE_SIZE = 6;

export function StoriesPage() {
  const navigate = useNavigate();
  const { stories, categories, loading, error, removeStory } = useStories();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [ageGroupFilter, setAgeGroupFilter] = useState('All');
  const [premiumFilter, setPremiumFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortOrder, setSortOrder] = useState('newest');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const ageGroups = useMemo(() => [...new Set(stories.map((story) => story.ageGroup).filter(Boolean))], [stories]);

  const filteredStories = useMemo(() => {
    const normalizedStories = [...stories].sort((first, second) => {
      const firstTime = first.createdAt ? new Date(first.createdAt).getTime() : 0;
      const secondTime = second.createdAt ? new Date(second.createdAt).getTime() : 0;
      return sortOrder === 'newest' ? secondTime - firstTime : firstTime - secondTime;
    });

    return normalizedStories.filter((story) => {
      const matchesTitle = story.title?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'All' || story.category === categoryFilter;
      const matchesAgeGroup = ageGroupFilter === 'All' || story.ageGroup === ageGroupFilter;
      const matchesPremium = premiumFilter === 'All' || (premiumFilter === 'Premium' ? story.isPremium : !story.isPremium);
      const matchesStatus = statusFilter === 'All' || story.status === statusFilter;
      return matchesTitle && matchesCategory && matchesAgeGroup && matchesPremium && matchesStatus;
    });
  }, [ageGroupFilter, categoryFilter, premiumFilter, search, sortOrder, statusFilter, stories]);

  const totalPages = Math.max(1, Math.ceil(filteredStories.length / PAGE_SIZE));
  const pagedStories = filteredStories.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const goToPage = (nextPage) => {
    setPage(Math.min(Math.max(1, nextPage), totalPages));
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    await removeStory(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="app-shell">
      <SidebarNav />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Content</p>
            <h1>Stories</h1>
          </div>
          <button className="primary-btn" type="button" onClick={() => navigate('/stories/new')}>
            Create Story
          </button>
        </header>

        <section className="panel-card">
          <div className="panel-header">
            <h3>Story library</h3>
            <span className="muted-text">{filteredStories.length} stories</span>
          </div>

          <div className="filters-row">
            <label className="field compact-field">
              <span>Search</span>
              <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by title" />
            </label>

            <label className="field compact-field">
              <span>Category</span>
              <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}>
                <option value="All">All</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="field compact-field">
              <span>Age Group</span>
              <select value={ageGroupFilter} onChange={(event) => { setAgeGroupFilter(event.target.value); setPage(1); }}>
                <option value="All">All</option>
                {ageGroups.map((ageGroup) => (
                  <option key={ageGroup} value={ageGroup}>
                    {ageGroup}
                  </option>
                ))}
              </select>
            </label>

            <label className="field compact-field">
              <span>Type</span>
              <select value={premiumFilter} onChange={(event) => { setPremiumFilter(event.target.value); setPage(1); }}>
                <option value="All">All</option>
                <option value="Free">Free</option>
                <option value="Premium">Premium</option>
              </select>
            </label>

            <label className="field compact-field">
              <span>Status</span>
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
                <option value="All">All</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>

            <label className="field compact-field">
              <span>Sort</span>
              <select value={sortOrder} onChange={(event) => { setSortOrder(event.target.value); setPage(1); }}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="empty-state">Loading stories…</div>
          ) : error ? (
            <div className="empty-state">{error}</div>
          ) : filteredStories.length === 0 ? (
            <div className="empty-state">No stories match your current filters.</div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Age</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStories.map((story) => (
                      <tr key={story.id}>
                        <td>{story.title}</td>
                        <td>{story.category}</td>
                        <td>{story.ageGroup}</td>
                        <td>{story.isPremium ? 'Premium' : 'Free'}</td>
                        <td>{story.status}</td>
                        <td>{story.updatedAt ? new Date(story.updatedAt).toLocaleDateString() : '—'}</td>
                        <td>
                          <div className="story-actions">
                            <button className="secondary-btn" type="button" onClick={() => navigate(`/stories/${story.id}/edit`)}>
                              Edit
                            </button>
                            <button className="ghost-btn" type="button" onClick={() => setDeleteTarget(story)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination-row">
                <button className="secondary-btn" type="button" disabled={page === 1} onClick={() => goToPage(page - 1)}>
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button className="secondary-btn" type="button" disabled={page === totalPages} onClick={() => goToPage(page + 1)}>
                  Next
                </button>
              </div>
            </>
          )}
        </section>
      </main>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete story"
        message={`Are you sure you want to delete ${deleteTarget?.title || 'this story'}?`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
