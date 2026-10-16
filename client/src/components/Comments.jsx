// Comment list and composer, shared by the post page and the Reels comment sheet.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar.jsx';
import { CaptionText } from './PostCard.jsx';
import { Spinner, ErrorState } from './Feedback.jsx';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useToast } from '../lib/context.jsx';

export function CommentList({ postId, onCountChange }) {
  const [comments, setComments] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api(`/posts/${postId}/comments`).then((d) => setComments(d.comments)).catch((e) => setError(e.message));
  };
  useEffect(load, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!comments) return <div className="center-pad"><Spinner /></div>;
  if (!comments.length) return <p className="muted center-pad">No comments yet. Start the conversation.</p>;

  return (
    <ul className="comment-list">
      {comments.map((c) => (
        <li key={c.id} className="comment fade-up">
          <Link to={`/u/${c.author.username}`} aria-label={`@${c.author.username}`}><Avatar user={c.author} size={32} /></Link>
          <div>
            <p><Link to={`/u/${c.author.username}`} className="strong">@{c.author.username}</Link> <CaptionText text={c.body} /></p>
            <span className="muted small">{timeAgo(c.createdAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CommentComposer({ postId, onPosted }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await api(`/posts/${postId}/comments`, { method: 'POST', body: { body: text } });
      setBody('');
      onPosted?.();
    } catch (err) {
      toast.show(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="composer" onSubmit={submit}>
      <label className="sr-only" htmlFor={`comment-${postId}`}>Add a comment</label>
      <input id={`comment-${postId}`} className="input" placeholder="Add a comment…" maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} />
      <button className="btn btn--primary btn--sm" disabled={!body.trim() || busy}>{busy ? 'Posting…' : 'Post'}</button>
    </form>
  );
}
