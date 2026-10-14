// Profile: identity, counts, follow or message, and a grid of posts, reels or saved items.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Grid3x3, Clapperboard, Bookmark, Lock, Play, Image as ImageIcon, Settings as SettingsIcon, MessageCircle } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { ErrorState, Spinner, EmptyState } from '../components/Feedback.jsx';
import { api } from '../lib/api';
import { useAuth, useToast } from '../lib/context.jsx';
import { formatCount } from '../lib/format';

export default function Profile() {
  const { username } = useParams();
  const { user: me } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('posts');
  const [saved, setSaved] = useState(null);

  const load = () => {
    setError('');
    api(`/users/${username}`).then(setData).catch((e) => setError(e.message));
  };
  useEffect(() => { setData(null); setSaved(null); setTab('posts'); load(); }, [username]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'saved' && data?.isMe && saved === null) {
      api('/me/saved').then((d) => setSaved(d.posts)).catch(() => setSaved([]));
    }
  }, [tab, data, saved]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <div className="center-pad"><Spinner /></div>;

  const { user, isMe, followed, locked, requested } = data;

  const toggleFollow = async () => {
    try {
      await api(`/users/${username}/follow`, { method: (followed || requested) ? 'DELETE' : 'POST' });
      load();
    } catch (err) {
      toast.show(err.message);
    }
  };

  const message = async () => {
    try {
      const res = await api('/messages/start', { method: 'POST', body: { username } });
      navigate(`/messages/${res.id}`);
    } catch (err) {
      toast.show(err.message);
    }
  };

  const shown = tab === 'saved' ? saved || [] : (data.posts || []).filter((p) => (tab === 'reels' ? p.mediaType === 'video' : true));

  return (
    <div className="profile fade-up">
      <header className="profile__head">
        <Avatar user={user} size={96} ring />
        <div className="profile__info">
          <div className="profile__top">
            <h1 className="profile__name">@{user.username}</h1>
            <div className="row">
              {isMe ? (
                <>
                  <Link to="/settings" className="btn btn--sm"><SettingsIcon size={16} /> Edit profile</Link>
                </>
              ) : (
                <>
                  <button className={`btn btn--sm${followed || requested ? '' : ' btn--primary'}`} onClick={toggleFollow}>
                    {followed ? 'Following' : requested ? 'Requested' : 'Follow'}
                  </button>
                  <button className="btn btn--sm" onClick={message}><MessageCircle size={16} /> Message</button>
                </>
              )}
            </div>
          </div>
          <ul className="profile__stats">
            <li><strong>{formatCount(user.posts)}</strong> posts</li>
            <li><strong>{formatCount(user.followers)}</strong> followers</li>
            <li><strong>{formatCount(user.following)}</strong> following</li>
          </ul>
          <p className="strong">{user.displayName}</p>
          {user.bio && <p className="bio">{user.bio}</p>}
          {user.isPrivate && <p className="muted small"><Lock size={13} /> Private account</p>}
        </div>
      </header>

      {locked ? (
        <EmptyState icon={Lock} title="This account is private">Follow @{user.username} to see their posts.</EmptyState>
      ) : (
        <>
          <nav className="tabs" aria-label="Profile sections">
            <button className={tab === 'posts' ? 'is-on' : ''} onClick={() => setTab('posts')} aria-pressed={tab === 'posts'}><Grid3x3 size={18} /> Posts</button>
            <button className={tab === 'reels' ? 'is-on' : ''} onClick={() => setTab('reels')} aria-pressed={tab === 'reels'}><Clapperboard size={18} /> Reels</button>
            {isMe && <button className={tab === 'saved' ? 'is-on' : ''} onClick={() => setTab('saved')} aria-pressed={tab === 'saved'}><Bookmark size={18} /> Saved</button>}
          </nav>

          {tab === 'saved' && saved === null ? (
            <div className="center-pad"><Spinner /></div>
          ) : shown.length === 0 ? (
            <EmptyState title={tab === 'saved' ? 'Nothing saved yet' : tab === 'reels' ? 'No reels yet' : 'No posts yet'}>
              {tab === 'saved' ? 'Tap the bookmark on any post to keep it here.' : isMe ? 'Share your first photo or video.' : ''}
            </EmptyState>
          ) : (
            <div className="grid">
              {shown.map((p) => (
                <Link key={p.id} to={`/p/${p.id}`} className="tile" aria-label={`${p.caption || 'Post'}, ${formatCount(p.likeCount)} likes`}>
                  {p.status !== 'published' ? (
                    <span className="tile__placeholder tile__placeholder--status">{p.status === 'failed' ? 'Failed' : 'Processing'}</span>
                  ) : p.thumbUrl || p.mediaUrl ? (
                    <img src={p.thumbUrl || p.mediaUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="tile__placeholder"><ImageIcon size={22} /></span>
                  )}
                  {p.mediaType === 'video' && <span className="tile__badge" aria-hidden="true"><Play size={14} fill="currentColor" /></span>}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
