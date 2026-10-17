import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Play, Grid3x3, List } from 'lucide-react';
import PostCard from '../components/PostCard.jsx';
import { Spinner, EmptyState, ErrorState } from '../components/Feedback.jsx';
import { api } from '../lib/api';

export default function Saved() {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'feed'

  const load = () => {
    setError('');
    api('/me/saved')
      .then((d) => setPosts(d.posts || []))
      .catch((e) => setError(e.message));
  };

  useEffect(load, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!posts) return <div className="center-pad"><Spinner /></div>;

  return (
    <div className="saved-page fade-up" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Saved posts</h1>
        {posts.length > 0 && (
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

      {posts.length === 0 ? (
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
    </div>
  );
}
