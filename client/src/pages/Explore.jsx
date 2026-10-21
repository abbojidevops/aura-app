// Explore: trending grid when empty; search people, posts and #hashtags when typing.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Heart, Play, Image as ImageIcon, Layers } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/Feedback.jsx';
import { api } from '../lib/api';
import { formatCount } from '../lib/format';

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // 'all' | 'people' | 'posts'

  const [followedCreators, setFollowedCreators] = useState({});

  // Keep the input in sync when the URL changes (e.g. clicking a #hashtag in a caption).
  useEffect(() => { setQ(params.get('q') || ''); }, [params]);

  // Debounce searches by 250ms so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      setError('');
      api(`/explore${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        .then(setData)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const onChange = (value) => {
    setQ(value);
    setParams(value.trim() ? { q: value } : {}, { replace: true });
  };

  const followCreator = async (target) => {
    try {
      const willUnfollow = !!followedCreators[target.id];
      const res = await api(`/users/${target.username}/follow`, { method: willUnfollow ? 'DELETE' : 'POST' });
      setFollowedCreators((prev) => ({ ...prev, [target.id]: res.followed || res.requested }));
    } catch {
      // ignore
    }
  };

  const searching = q.trim().length > 0;

  return (
    <div className="explore">
      <label className="searchbox">
        <Search size={18} aria-hidden="true" />
        <span className="sr-only">Search people, posts and hashtags</span>
        <input className="input" type="search" value={q} onChange={(e) => onChange(e.target.value)} placeholder="Search people, posts and #tags" />
      </label>

      {searching && (
        <div className="segmented" role="tablist" style={{ marginTop: 12, marginBottom: 8 }}>
          <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>All</button>
          <button role="tab" aria-selected={filter === 'people'} className={filter === 'people' ? 'is-on' : ''} onClick={() => setFilter('people')}>People</button>
          <button role="tab" aria-selected={filter === 'posts'} className={filter === 'posts' ? 'is-on' : ''} onClick={() => setFilter('posts')}>Posts</button>
        </div>
      )}

      {!searching && data?.tags?.length > 0 && (
        <div className="chips" aria-label="Trending tags">
          {data.tags.map((t) => (
            <button key={t.tag} className="chip" onClick={() => onChange(`#${t.tag}`)}>#{t.tag}</button>
          ))}
        </div>
      )}

      {!searching && data?.suggestedUsers?.length > 0 && (
        <section aria-label="Discover creators">
          <h2 className="section-title">Discover creators</h2>
          <div className="creators-scroll">
            {data.suggestedUsers.map((u) => (
              <div key={u.id} className="creator-card">
                <Link to={`/u/${u.username}`} className="creator-card__link">
                  <Avatar user={u} size={52} />
                  <span className="strong small truncate" style={{ maxWidth: 130 }}>{u.displayName}</span>
                  <span className="muted small truncate" style={{ maxWidth: 130 }}>@{u.username}</span>
                </Link>
                <button
                  className={`btn btn--sm${followedCreators[u.id] ? '' : ' btn--primary'}`}
                  onClick={() => followCreator(u)}
                >
                  {followedCreators[u.id] ? 'Following' : 'Follow'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {error && <ErrorState message={error} />}
      {loading && !data && <div className="center-pad"><Spinner /></div>}

      {searching && (filter === 'all' || filter === 'people') && data?.users?.length > 0 && (
        <section className="stack-sm" aria-label="People">
          <h2 className="section-title">People</h2>
          {data.users.map((u) => (
            <Link key={u.id} to={`/u/${u.username}`} className="person">
              <Avatar user={u} size={44} />
              <span className="person__names">
                <span className="strong">{u.displayName}</span>
                <span className="muted small">@{u.username}</span>
              </span>
            </Link>
          ))}
        </section>
      )}

      {searching && filter === 'people' && data?.users?.length === 0 && !loading && (
        <EmptyState icon={Search} title="No people found">
          No users match "{q}".
        </EmptyState>
      )}

      {data && (filter === 'all' || filter === 'posts' || !searching) && (
        <section aria-label={searching ? 'Posts' : 'Trending'}>
          {!searching && <h2 className="section-title">Trending</h2>}
          {searching && data.posts.length > 0 && <h2 className="section-title">Posts</h2>}
          {data.posts.length === 0 ? (
            !loading && <EmptyState icon={Search} title={searching ? 'No posts found' : 'Nothing trending yet'}>
              {searching ? 'Try another word or #tag.' : 'Posts will appear here as people share.'}
            </EmptyState>
          ) : (
            <div className="grid">
              {data.posts.map((p) => (
                <Link key={p.id} to={`/p/${p.id}`} className="tile" aria-label={`${p.caption || 'Post'} by @${p.author.username}, ${formatCount(p.likeCount)} likes`}>
                  {p.thumbUrl || p.mediaUrl ? (
                    <img src={p.thumbUrl || p.mediaUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="tile__placeholder"><ImageIcon size={22} /></span>
                  )}
                  {p.mediaType === 'video' && <span className="tile__badge" aria-hidden="true"><Play size={14} fill="currentColor" /></span>}
                  {p.mediaType === 'carousel' && <span className="tile__badge" aria-label="Carousel post" title="Carousel post"><Layers size={14} /></span>}
                  <span className="tile__overlay" aria-hidden="true"><Heart size={16} fill="currentColor" /> {formatCount(p.likeCount)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
