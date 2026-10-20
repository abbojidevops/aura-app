import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Play, Grid3x3, List, FolderPlus, Folder, ArrowLeft, Trash2 } from 'lucide-react';
import PostCard from '../components/PostCard.jsx';
import Sheet from '../components/Sheet.jsx';
import { Spinner, EmptyState, ErrorState } from '../components/Feedback.jsx';
import { api } from '../lib/api';
import { useToast } from '../lib/context.jsx';

export default function Saved() {
  const toast = useToast();
  const [tab, setTab] = useState('all'); // 'all' | 'collections'
  const [posts, setPosts] = useState(null);
  const [collections, setCollections] = useState(null);
  const [activeCollection, setActiveCollection] = useState(null);
  const [collectionPosts, setCollectionPosts] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'feed'

  const loadSaved = () => {
    setError('');
    api('/me/saved')
      .then((d) => setPosts(d.posts || []))
      .catch((e) => setError(e.message));
  };

  const loadCollections = () => {
    api('/me/collections')
      .then((d) => setCollections(d.collections || []))
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    loadSaved();
    loadCollections();
  }, []);

  const openCollection = (col) => {
    setActiveCollection(col);
    setCollectionPosts(null);
    api(`/me/collections/${col.id}`)
      .then((d) => setCollectionPosts(d.posts || []))
      .catch((e) => toast.show(e.message));
  };

  const createCollection = async (e) => {
    e.preventDefault();
    const name = newColName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await api('/me/collections', { method: 'POST', body: { name } });
      setCollections((prev) => [res.collection, ...(prev || [])]);
      setNewColName('');
      setCreateOpen(false);
      toast.show('Collection created');
    } catch (err) {
      toast.show(err.message);
    } finally {
      setCreating(false);
    }
  };

  const deleteCollection = async () => {
    if (!activeCollection) return;
    if (!window.confirm(`Delete collection "${activeCollection.name}"? Saved posts will remain in your All Saved list.`)) return;
    try {
      await api(`/me/collections/${activeCollection.id}`, { method: 'DELETE' });
      setCollections((prev) => (prev || []).filter((c) => c.id !== activeCollection.id));
      setActiveCollection(null);
      setCollectionPosts(null);
      toast.show('Collection deleted');
    } catch (err) {
      toast.show(err.message);
    }
  };

  if (error) return <ErrorState message={error} onRetry={loadSaved} />;
  if (!posts || !collections) return <div className="center-pad"><Spinner /></div>;

  return (
    <div className="saved-page fade-up" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {activeCollection ? activeCollection.name : 'Saved'}
        </h1>
        {activeCollection ? (
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn--sm" onClick={() => setActiveCollection(null)}>
              <ArrowLeft size={16} /> Collections
            </button>
            <button className="icon-btn" onClick={deleteCollection} aria-label="Delete collection" title="Delete collection">
              <Trash2 size={18} style={{ color: 'var(--danger)' }} />
            </button>
          </div>
        ) : (
          <div className="row" style={{ gap: 12 }}>
            <div className="segmented" role="tablist">
              <button
                role="tab"
                aria-selected={tab === 'all'}
                className={tab === 'all' ? 'is-on' : ''}
                onClick={() => setTab('all')}
              >
                All Posts
              </button>
              <button
                role="tab"
                aria-selected={tab === 'collections'}
                className={tab === 'collections' ? 'is-on' : ''}
                onClick={() => setTab('collections')}
              >
                Collections
              </button>
            </div>
            {tab === 'all' && posts.length > 0 && (
              <div className="segmented" role="radiogroup" aria-label="View mode">
                <button
                  role="radio"
                  aria-checked={viewMode === 'grid'}
                  className={viewMode === 'grid' ? 'is-on' : ''}
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  title="Grid view"
                >
                  <Grid3x3 size={16} />
                </button>
                <button
                  role="radio"
                  aria-checked={viewMode === 'feed'}
                  className={viewMode === 'feed' ? 'is-on' : ''}
                  onClick={() => setViewMode('feed')}
                  aria-label="Feed view"
                  title="Feed view"
                >
                  <List size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {activeCollection ? (
        collectionPosts === null ? (
          <div className="center-pad"><Spinner /></div>
        ) : collectionPosts.length === 0 ? (
          <EmptyState icon={Bookmark} title="Empty collection">
            Add saved posts to "{activeCollection.name}" from your post options menu.
          </EmptyState>
        ) : (
          <div className="grid">
            {collectionPosts.map((p) => (
              <Link key={p.id} to={`/p/${p.id}`} className="tile" aria-label={`Post by @${p.author.username}`}>
                {p.thumbUrl || p.mediaUrl ? (
                  <img src={p.thumbUrl || p.mediaUrl} alt="" loading="lazy" />
                ) : (
                  <div className="tile__placeholder">Text</div>
                )}
                {p.mediaType === 'video' && <Play size={16} className="tile__badge" fill="currentColor" />}
              </Link>
            ))}
          </div>
        )
      ) : tab === 'collections' ? (
        <div>
          <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn--sm btn--primary" onClick={() => setCreateOpen(true)}>
              <FolderPlus size={16} /> New Collection
            </button>
          </div>

          <div className="collections-grid">
            <button className="collection-new-card" onClick={() => setCreateOpen(true)}>
              <FolderPlus size={28} />
              <span className="strong small">New Collection</span>
            </button>
            {collections.map((c) => (
              <div key={c.id} className="collection-card" onClick={() => openCollection(c)} role="button" tabIndex={0}>
                <div className="collection-card__cover">
                  {c.coverThumb ? (
                    <img src={c.coverThumb} alt="" loading="lazy" />
                  ) : (
                    <Folder size={36} style={{ color: 'var(--muted)', opacity: 0.6 }} />
                  )}
                </div>
                <div className="collection-card__info">
                  <span className="collection-card__title truncate">{c.name}</span>
                  <span className="collection-card__count">{c.postCount} {c.postCount === 1 ? 'post' : 'posts'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : posts.length === 0 ? (
        <EmptyState icon={Bookmark} title="No saved posts yet">
          Save posts by tapping the bookmark icon to revisit your favorite inspirations later.
        </EmptyState>
      ) : viewMode === 'grid' ? (
        <div className="grid">
          {posts.map((p) => (
            <Link key={p.id} to={`/p/${p.id}`} className="tile" aria-label={`Post by @${p.author.username}`}>
              {p.thumbUrl || p.mediaUrl ? (
                <img src={p.thumbUrl || p.mediaUrl} alt="" loading="lazy" />
              ) : (
                <div className="tile__placeholder">Text</div>
              )}
              {p.mediaType === 'video' && <Play size={16} className="tile__badge" fill="currentColor" />}
            </Link>
          ))}
        </div>
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              patch={(changes) => {
                if (changes.saved === false) {
                  setPosts((prev) => (prev || []).filter((p) => p.id !== post.id));
                } else {
                  setPosts((prev) => (prev || []).map((p) => (p.id === post.id ? { ...p, ...changes } : p)));
                }
              }}
              onDeleted={(id) => setPosts((prev) => (prev || []).filter((p) => p.id !== id))}
            />
          ))}
        </div>
      )}

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="New Collection">
        <form className="stack" onSubmit={createCollection}>
          <label className="label" htmlFor="col-name">Collection Name</label>
          <input
            id="col-name"
            className="input"
            value={newColName}
            maxLength={50}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder="e.g. Architecture, Design Inspo, Recipes…"
            autoFocus
          />
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn btn--sm" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn--primary btn--sm" disabled={creating || !newColName.trim()}>
              {creating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}