import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Flag, Trash2, Edit3, Link as LinkIcon, Info, Pin, FolderPlus, Check } from 'lucide-react';
import Avatar from './Avatar.jsx';
import MediaFrame from './MediaFrame.jsx';
import Sheet from './Sheet.jsx';
import { Spinner } from './Feedback.jsx';
import { useAuth, useToast } from '../lib/context.jsx';
import { api } from '../lib/api';
import { toggleLike, toggleSave, sharePost } from '../lib/actions';
import { timeAgo, plural } from '../lib/format';
import { subscribeRealtime } from '../lib/realtime';

const REPORT_REASONS = ['Spam', 'Harassment or bullying', 'Misleading information', 'Unsafe or violent', 'Something else'];

export default function PostCard({ post, patch, reasons, onDeleted }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption || '');
  const [busyEdit, setBusyEdit] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [likersOpen, setLikersOpen] = useState(false);
  const [likers, setLikers] = useState(null);
  const [likersLoading, setLikersLoading] = useState(false);
  const [colPickerOpen, setColPickerOpen] = useState(false);
  const [collections, setCollections] = useState(null);
  const [colLoading, setColLoading] = useState(false);
  const [newColName, setNewColName] = useState('');
  const isMine = user && post.author.id === user.id;

  useEffect(() => {
    return subscribeRealtime((msg) => {
      if (msg.type === 'poll_vote' && msg.postId === post.id) {
        patch?.({ poll: msg.poll });
      }
    });
  }, [post.id]);

  const votePoll = async (optionId) => {
    try {
      const res = await api(`/posts/${post.id}/poll/vote`, { method: 'POST', body: { optionId } });
      patch?.({ poll: res.poll });
    } catch (err) {
      toast.show(err.message);
    }
  };

  const openLikers = async () => {
    if (post.likeCount <= 0) return;
    setLikersOpen(true);
    setLikersLoading(true);
    try {
      const res = await api(`/posts/${post.id}/likes`);
      setLikers(res.users || []);
    } catch (err) {
      toast.show(err.message);
      setLikersOpen(false);
    } finally {
      setLikersLoading(false);
    }
  };

  const toggleLikerFollow = async (targetUser) => {
    try {
      const willUnfollow = targetUser.followed || targetUser.requested;
      const res = await api(`/users/${targetUser.username}/follow`, { method: willUnfollow ? 'DELETE' : 'POST' });
      setLikers((prev) =>
        (prev || []).map((u) =>
          u.id === targetUser.id
            ? { ...u, followed: res.followed, requested: res.requested }
            : u
        )
      );
    } catch (err) {
      toast.show(err.message);
    }
  };

  const togglePin = async () => {
    setMenuOpen(false);
    try {
      const res = await api(`/posts/${post.id}/pin`, { method: post.isPinned ? 'DELETE' : 'POST' });
      patch?.({ isPinned: res.isPinned });
      toast.show(res.isPinned ? 'Post pinned to your profile' : 'Post unpinned from profile');
    } catch (err) {
      toast.show(err.message);
    }
  };

  const like = () => {
    setLiking(true);
    setTimeout(() => setLiking(false), 400);
    toggleLike(post, patch, toast);
  };
  const doubleTapLike = () => { if (!post.liked) like(); else { setLiking(true); setTimeout(() => setLiking(false), 400); } };

  const report = async (reason) => {
    setReportOpen(false);
    try {
      const res = await api(`/posts/${post.id}/report`, { method: 'POST', body: { reason } });
      toast.show(res.message);
    } catch (err) {
      toast.show(err.message);
    }
  };

  const remove = async () => {
    setMenuOpen(false);
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    try {
      await api(`/posts/${post.id}`, { method: 'DELETE' });
      toast.show('Post deleted');
      onDeleted?.(post.id);
    } catch (err) {
      toast.show(err.message);
    }
  };

  const startEdit = () => {
    setEditCaption(post.caption || '');
    setMenuOpen(false);
    setEditOpen(true);
  };

  const saveCaption = async (e) => {
    e.preventDefault();
    setBusyEdit(true);
    try {
      const res = await api(`/posts/${post.id}`, { method: 'PATCH', body: { caption: editCaption } });
      patch?.({ caption: res.post.caption, tags: res.post.tags });
      setEditOpen(false);
      toast.show('Caption updated');
    } catch (err) {
      toast.show(err.message);
    } finally {
      setBusyEdit(false);
    }
  };

  const openColPicker = () => {
    setMenuOpen(false);
    setColPickerOpen(true);
    setColLoading(true);
    api('/me/collections')
      .then((d) => setCollections(d.collections || []))
      .catch((e) => toast.show(e.message))
      .finally(() => setColLoading(false));
  };

  const addToCollection = async (colId, colName) => {
    try {
      await api(`/me/collections/${colId}/posts`, { method: 'POST', body: { postId: post.id } });
      patch?.({ saved: true });
      setColPickerOpen(false);
      toast.show(`Saved to ${colName}`);
    } catch (e) {
      toast.show(e.message);
    }
  };

  const createAndAddToCollection = async (e) => {
    e.preventDefault();
    const name = newColName.trim();
    if (!name) return;
    try {
      const res = await api('/me/collections', { method: 'POST', body: { name } });
      await api(`/me/collections/${res.collection.id}/posts`, { method: 'POST', body: { postId: post.id } });
      patch?.({ saved: true });
      setNewColName('');
      setColPickerOpen(false);
      toast.show(`Saved to ${res.collection.name}`);
    } catch (e) {
      toast.show(e.message);
    }
  };

  const ratio = post.width && post.height ? post.width / post.height : 4 / 5;

  return (
    <article className="card post fade-up" aria-label={`Post by @${post.author.username}`}>
      <header className="post__head">
        <Link to={`/u/${post.author.username}`} className="post__author" aria-label={`View @${post.author.username}`}>
          <Avatar user={post.author} size={36} ring />
          <span className="post__names">
            <span className="strong">@{post.author.username}</span>
            <span className="muted small">
              {timeAgo(post.createdAt)}
              {post.isPinned && (
                <span className="post__pinned" title="Pinned to profile">
                  {' · '}<Pin size={11} fill="currentColor" style={{ verticalAlign: -1 }} /> Pinned
                </span>
              )}
            </span>
          </span>
        </Link>
        <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="More options">
          <MoreHorizontal size={20} />
        </button>
      </header>

      <MediaFrame post={post} active={false} onDoubleTap={doubleTapLike} className="post__media" />

      <div className="post__actions">
        <button className={`icon-btn action${post.liked ? ' is-liked' : ''}${liking ? ' pop' : ''}`} onClick={like} aria-pressed={post.liked} aria-label={post.liked ? 'Unlike' : 'Like'}>
          <Heart size={24} fill={post.liked ? 'currentColor' : 'none'} />
        </button>
        <button className="icon-btn action" onClick={() => navigate(`/p/${post.id}`)} aria-label="Comments">
          <MessageCircle size={24} />
        </button>
        <button className="icon-btn action" onClick={() => sharePost(post, toast)} aria-label="Share">
          <Send size={22} />
        </button>
        <button className={`icon-btn action action--end${post.saved ? ' is-saved' : ''}`} onClick={() => toggleSave(post, patch, toast)} aria-pressed={post.saved} aria-label={post.saved ? 'Remove from saved' : 'Save'}>
          <Bookmark size={22} fill={post.saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="post__body">
        <div style={{ marginBottom: 4 }}>
          {post.likeCount > 0 ? (
            <button
              type="button"
              className="btn-link strong"
              onClick={openLikers}
              style={{ padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
              aria-label="View who liked this post"
            >
              {plural(post.likeCount, 'like')}
            </button>
          ) : (
            <span className="strong">0 likes</span>
          )}
        </div>
        {post.caption && (
          <p className="caption">
            <Link to={`/u/${post.author.username}`} className="strong">@{post.author.username}</Link>{' '}
            <CaptionText text={post.caption} />
          </p>
        )}
        {post.poll && (
          <div className="post-poll">
            <div className="post-poll__question strong">{post.poll.question}</div>
            <div className="post-poll__options">
              {post.poll.options.map((opt) => {
                const isVoted = post.poll.myVote === opt.id;
                const hasVotedAny = post.poll.myVote != null;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`post-poll__opt${isVoted ? ' is-voted' : ''}`}
                    onClick={() => votePoll(opt.id)}
                  >
                    {hasVotedAny && (
                      <div
                        className="post-poll__fill"
                        style={{ width: `${opt.percent}%` }}
                      />
                    )}
                    <span className="post-poll__text">
                      {opt.text}
                      {isVoted && <Check size={14} className="post-poll__check" />}
                    </span>
                    {hasVotedAny && (
                      <span className="post-poll__percent">{opt.percent}%</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="post-poll__meta muted small">
              {post.poll.totalVotes} {post.poll.totalVotes === 1 ? 'vote' : 'votes'}
              {post.poll.myVote != null && ' · Tap choice to change/remove'}
            </div>
          </div>
        )}
        {post.commentCount > 0 && (
          <Link to={`/p/${post.id}`} className="muted small">View all {post.commentCount} comment{post.commentCount === 1 ? '' : 's'}</Link>
        )}
        {reasons && reasons.length > 0 && (
          <div className="why">
            <button className="btn-link small" onClick={() => setShowWhy((v) => !v)} aria-expanded={showWhy}>
              <Info size={14} /> Why am I seeing this?
            </button>
            {showWhy && (
              <ul className="why__list fade-up">
                {reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Post options">
        <div className="menu">
          <button className="menu__item" onClick={() => { setMenuOpen(false); sharePost(post, toast); }}><LinkIcon size={18} /> Copy link</button>
          <button className="menu__item" onClick={openColPicker}>
            <Bookmark size={18} /> Save to collection…
          </button>
          {isMine && (
            <button className="menu__item" onClick={togglePin}>
              <Pin size={18} /> {post.isPinned ? 'Unpin from profile' : 'Pin to profile'}
            </button>
          )}
          {isMine && <button className="menu__item" onClick={startEdit}><Edit3 size={18} /> Edit caption</button>}
          {!isMine && <button className="menu__item" onClick={() => { setMenuOpen(false); setReportOpen(true); }}><Flag size={18} /> Report</button>}
          {isMine && <button className="menu__item menu__item--danger" onClick={remove}><Trash2 size={18} /> Delete post</button>}
        </div>
      </Sheet>
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="Edit caption">
        <form className="stack" onSubmit={saveCaption}>
          <textarea
            className="input"
            rows={4}
            value={editCaption}
            maxLength={2200}
            onChange={(e) => setEditCaption(e.target.value)}
            placeholder="Write a caption…"
          />
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--sm" onClick={() => setEditOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn--primary btn--sm" disabled={busyEdit}>{busyEdit ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Sheet>
      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title="Why are you reporting this?">
        <div className="menu">
          {REPORT_REASONS.map((r) => <button key={r} className="menu__item" onClick={() => report(r)}>{r}</button>)}
        </div>
        <p className="muted small">Posts with three reports are hidden while our team reviews them.</p>
      </Sheet>

      <Sheet open={likersOpen} onClose={() => setLikersOpen(false)} title="Likes">
        {likersLoading && <div className="center-pad"><Spinner /></div>}
        {!likersLoading && likers?.length === 0 && <p className="muted center-pad">No likes yet.</p>}
        {!likersLoading && likers?.length > 0 && (
          <ul className="likers-list">
            {likers.map((u) => (
              <li key={u.id} className="likers-list__item">
                <Link
                  to={`/u/${u.username}`}
                  className="likers-list__link"
                  onClick={() => setLikersOpen(false)}
                >
                  <Avatar user={u} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <span className="strong block small truncate">{u.displayName}</span>
                    <span className="muted small truncate">@{u.username}</span>
                  </div>
                </Link>
                {!u.isMe && (
                  <button
                    type="button"
                    className={`btn btn--sm${u.followed ? '' : ' btn--primary'}`}
                    onClick={() => toggleLikerFollow(u)}
                  >
                    {u.followed ? 'Following' : (u.requested ? 'Requested' : 'Follow')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      <Sheet open={colPickerOpen} onClose={() => setColPickerOpen(false)} title="Save to collection">
        {colLoading && <div className="center-pad"><Spinner /></div>}
        {!colLoading && (
          <div className="stack" style={{ gap: 12 }}>
            <form onSubmit={createAndAddToCollection} className="row" style={{ gap: 8 }}>
              <input
                className="input input--sm"
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="New collection name…"
                maxLength={50}
              />
              <button className="btn btn--sm btn--primary" disabled={!newColName.trim()} type="submit">Create</button>
            </form>
            <div className="menu" style={{ maxHeight: 240, overflowY: 'auto' }}>
              {collections?.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  className="menu__item"
                  onClick={() => addToCollection(col.id, col.name)}
                >
                  <FolderPlus size={18} />
                  <span className="truncate">{col.name}</span>
                  <span className="muted small" style={{ marginLeft: 'auto' }}>{col.postCount}</span>
                </button>
              ))}
              {collections?.length === 0 && (
                <p className="muted small center-pad">No collections yet. Create one above.</p>
              )}
            </div>
          </div>
        )}
      </Sheet>
    </article>
  );
}

// Turns #hashtags into Explore links and @mentions into Profile links.
export function CaptionText({ text }) {
  if (!text) return null;
  return text.split(/(#[\p{L}\p{N}_]+|@[a-zA-Z0-9_.]+)/u).map((part, i) => {
    if (part.startsWith('#')) {
      return (
        <Link key={i} to={`/explore?q=${encodeURIComponent(part)}`} className="tag">
          {part}
        </Link>
      );
    }
    if (part.startsWith('@')) {
      const uname = part.slice(1);
      return (
        <Link key={i} to={`/u/${uname}`} className="tag" style={{ color: 'var(--accent)' }}>
          {part}
        </Link>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export { REPORT_REASONS, MoreHorizontal };
