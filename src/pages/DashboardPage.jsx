import { useMemo } from 'react';
import { SidebarNav } from '../components/SidebarNav';
import { useStories } from '../hooks/useStories';

function getStoryTimestamp(value) {
  const date = value?.toDate ? value.toDate() : new Date(value || 0);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function DashboardPage() {
  const { stories, categories, loading, error } = useStories();

  const stats = useMemo(() => {
    const totalStories = stories.length;
    const freeStories = stories.filter((story) => !story.isPremium && !story.premium).length;
    const premiumStories = stories.filter((story) => story.isPremium || story.premium).length;
    const publishedStories = stories.filter((story) => story.status === 'published').length;
    const draftStories = stories.filter((story) => story.status === 'draft').length;
    return [
      { label: 'Total Stories', value: totalStories, tone: 'green' },
      { label: 'Categories', value: categories.length, tone: 'blue' },
      { label: 'Premium Stories', value: premiumStories, tone: 'purple' },
      { label: 'Free Stories', value: freeStories, tone: 'orange' },
      { label: 'Published Stories', value: publishedStories, tone: 'green' },
      { label: 'Draft Stories', value: draftStories, tone: 'blue' },
    ];
  }, [categories.length, stories]);

  const recentStories = useMemo(() => {
    return [...stories]
      .sort((first, second) => getStoryTimestamp(second.createdAt) - getStoryTimestamp(first.createdAt))
      .slice(0, 4);
  }, [stories]);

  return (
    <div className="app-shell">
      <SidebarNav />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Overview</p>
            <h1>Dashboard</h1>
          </div>
          <div className="topbar-badge">Live content ready</div>
        </header>

        <section className="stats-grid">
          {stats.map((stat) => (
            <article key={stat.label} className={`stat-card ${stat.tone}`}>
              <p>{stat.label}</p>
              <h2>{stat.value}</h2>
            </article>
          ))}
        </section>

        <section className="content-grid">
          <article className="panel-card">
            <div className="panel-header">
              <h3>Recently Added Stories</h3>
            </div>
            {loading ? (
              <p className="muted-text">Loading recent stories…</p>
            ) : error ? (
              <p className="form-error">{error}</p>
            ) : recentStories.length ? (
              <ul className="list-view">
                {recentStories.map((story) => (
                  <li key={story.id}>
                    <div>
                      <strong>{story.title}</strong>
                      <p>{story.category}</p>
                    </div>
                    <span>{story.createdAt ? new Date(story.createdAt).toLocaleDateString() : 'Recently added'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-text">No stories available yet.</p>
            )}
          </article>

          <article className="panel-card">
            <div className="panel-header">
              <h3>Quick Notes</h3>
            </div>
            <p className="muted-text">
              The dashboard reflects live Supabase data for stories, categories, premium/free status, and publication state.
            </p>
          </article>
        </section>
      </main>
    </div>
  );
}
