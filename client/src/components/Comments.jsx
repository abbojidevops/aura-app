import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Heart } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { CaptionText } from './PostCard.jsx';
import { Spinner, ErrorState } from './Feedback.jsx';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useAuth, useToast } from '../lib/context.jsx';

export function CommentList({ postId, postAuthorId, onCountChange, onReply }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const [comments, setComments] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api(`/posts/${postId}/comments`)
      .then((d) => setComments(d.comments))
      .catch((e) => setError(e.message));
  };
  useEffect(load, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteComment = async (commentId) => {
    try {
      await api(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
      setComments((prev) => {
        const next = (prev || []).filter((c) => c.id !== commentId);
        onCountChange?.(next.length);
        return next;
      });
      toast.show('Comment deleted');
    } catch (err) {
      toast.show(err.message);
    }
  };

  const toggleCommentLike = async (comment) => {
    const wasLiked = !!comment.liked;
    const prevCount = comment.likeCount || 0;

    // Optimistic update
    setComments((prev) =>
      (prev || []).map((c) =>
        c.id === comment.id
          ? { ...c, liked: !wasLiked, likeCount: wasLiked ? Math.max(prevCount - 1, 0) : prevCount + 1 }
          : c
      )
    );

    try {
      const res = await api(`/comments/${comment.id}/like`, { method: wasLiked ? 'DELETE' : 'POST' });
      setComments((prev) =>
        (prev || []).map((c) =>
          c.id === comment.id
            ? { ...c, liked: res.liked, likeCount: res.likeCount }
            : c
        )
      );
    } catch (err) {
      // Revert on error
      setComments((prev) =>
        (prev || []).map((c) =>
          c.id === comment.id
            ? { ...c, liked: wasLiked, likeCount: prevCount }
            : c
        )
      );
      toast.show(err.message);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!comments) return <div className="center-pad"><Spinner /></div>;
  if (!comments.length) return <p className="muted center-pad">No comments yet. Start the conversation.</p>;

  return (
    <ul className="comment-list">
      {comments.map((c) => {
        const canDelete = me && (c.author.id === me.id || postAuthorId === me.id);
        return (
          <li key={c.id} className="comment fade-up">
            <Link to={`/u/${c.author.username}`} aria-label={`@${c.author.username}`}>
              <Avatar user={c.author} size={32} />
            </Link>
            <div className="comment__body">
              <p>
                <Link to={`/u/${c.author.username}`} className="strong">@{c.author.username}</Link>{' '}
                <CaptionText text={c.body} />
              </p>
              <div className="comment__meta">
                <span className="muted small">{timeAgo(c.createdAt)}</span>
                <button
                  type="button"
                  className="btn-link small muted"
                  onClick={() => onReply?.(c.author.username)}
                >
                  Reply
                </button>
                {canDelete && (
                  <button
                    className="comment__delete"
                    onClick={() => deleteComment(c.id)}
                    title="Delete comment"
                    aria-label="Delete comment"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              className={`comment__like-btn${c.liked ? ' is-liked' : ''}`}
              onClick={() => toggleCommentLike(c)}
              aria-label={c.liked ? 'Unlike comment' : 'Like comment'}
              title={c.liked ? 'Unlike' : 'Like'}
            >
              <Heart size={14} fill={c.liked ? 'currentColor' : 'none'} />
              {c.likeCount > 0 && <span>{c.likeCount}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function CommentComposer({ postId, onPosted, replyUser, onReplyHandled }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (replyUser) {
      setBody((prev) => {
        const mention = `@${replyUser} `;
        if (prev.startsWith(mention)) return prev;
        return `${mention}${prev}`;
      });
      inputRef.current?.focus();
      onReplyHandled?.();
    }
  }, [replyUser, onReplyHandled]);

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
      <input
        ref={inputRef}
        id={`comment-${postId}`}
        className="input"
        placeholder="Add a comment…"
        maxLength={500}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button className="btn btn--primary btn--sm" disabled={!body.trim() || busy}>
        {busy ? 'Posting…' : 'Post'}
      </button>
    </form>
  );
}
