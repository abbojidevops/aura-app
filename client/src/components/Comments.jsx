import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Heart, X, CornerDownRight } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { CaptionText } from './PostCard.jsx';
import { Spinner, ErrorState } from './Feedback.jsx';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useAuth, useToast } from '../lib/context.jsx';

export function CommentList({ postId, postAuthorId, onCountChange, onReply, autoExpandParentId }) {
  const { user: me } = useAuth();
  const toast = useToast();
  const [comments, setComments] = useState(null);
  const [error, setError] = useState('');
  const [expandedThreads, setExpandedThreads] = useState(() => new Set());

  const load = () => {
    setError('');
    api(`/posts/${postId}/comments`)
      .then((d) => {
        setComments(d.comments || []);
        if (autoExpandParentId) {
          setExpandedThreads((prev) => new Set(prev).add(autoExpandParentId));
        }
      })
      .catch((e) => setError(e.message));
  };

  useEffect(load, [postId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoExpandParentId) {
      setExpandedThreads((prev) => new Set(prev).add(autoExpandParentId));
    }
  }, [autoExpandParentId]);

  const toggleReplies = (commentId) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const deleteComment = async (commentId, parentId = null) => {
    try {
      await api(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
      setComments((prev) => {
        if (!prev) return prev;
        if (!parentId) {
          const next = prev.filter((c) => c.id !== commentId);
          const totalCount = next.reduce((acc, c) => acc + 1 + (c.replyCount || 0), 0);
          onCountChange?.(totalCount);
          return next;
        } else {
          const next = prev.map((c) => {
            if (c.id === parentId) {
              const updatedReplies = (c.replies || []).filter((r) => r.id !== commentId);
              return { ...c, replies: updatedReplies, replyCount: updatedReplies.length };
            }
            return c;
          });
          const totalCount = next.reduce((acc, c) => acc + 1 + (c.replyCount || 0), 0);
          onCountChange?.(totalCount);
          return next;
        }
      });
      toast.show('Comment deleted');
    } catch (err) {
      toast.show(err.message);
    }
  };

  const toggleCommentLike = async (comment, parentId = null) => {
    const wasLiked = !!comment.liked;
    const prevCount = comment.likeCount || 0;
    const nextCount = wasLiked ? Math.max(prevCount - 1, 0) : prevCount + 1;

    // Helper for optimistic update
    const updateList = (likedState, count) => {
      setComments((prev) =>
        (prev || []).map((c) => {
          if (!parentId && c.id === comment.id) {
            return { ...c, liked: likedState, likeCount: count };
          }
          if (parentId && c.id === parentId) {
            return {
              ...c,
              replies: (c.replies || []).map((r) =>
                r.id === comment.id ? { ...r, liked: likedState, likeCount: count } : r
              ),
            };
          }
          return c;
        })
      );
    };

    updateList(!wasLiked, nextCount);

    try {
      const res = await api(`/comments/${comment.id}/like`, { method: wasLiked ? 'DELETE' : 'POST' });
      updateList(res.liked, res.likeCount);
    } catch (err) {
      updateList(wasLiked, prevCount);
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
        const hasReplies = (c.replies && c.replies.length > 0) || (c.replyCount > 0);
        const isExpanded = expandedThreads.has(c.id);

        return (
          <li key={c.id} className="comment-thread fade-up">
            <div className="comment">
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
                    onClick={() => onReply?.({ parentId: c.id, username: c.author.username })}
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
            </div>

            {/* Replies section */}
            {hasReplies && (
              <div className="comment-replies-wrap">
                <button
                  type="button"
                  className="btn-link small muted comment-replies__toggle"
                  onClick={() => toggleReplies(c.id)}
                  aria-expanded={isExpanded}
                >
                  <span className="comment-replies__line" />
                  {isExpanded
                    ? 'Hide replies'
                    : `View ${c.replyCount || c.replies?.length} ${(c.replyCount || c.replies?.length) === 1 ? 'reply' : 'replies'}`}
                </button>

                {isExpanded && c.replies && c.replies.length > 0 && (
                  <ul className="comment-replies">
                    {c.replies.map((r) => {
                      const canDeleteReply = me && (r.author.id === me.id || postAuthorId === me.id);
                      return (
                        <li key={r.id} className="comment comment--reply fade-up">
                          <Link to={`/u/${r.author.username}`} aria-label={`@${r.author.username}`}>
                            <Avatar user={r.author} size={26} />
                          </Link>
                          <div className="comment__body">
                            <p>
                              <Link to={`/u/${r.author.username}`} className="strong">@{r.author.username}</Link>{' '}
                              <CaptionText text={r.body} />
                            </p>
                            <div className="comment__meta">
                              <span className="muted small">{timeAgo(r.createdAt)}</span>
                              <button
                                type="button"
                                className="btn-link small muted"
                                onClick={() => onReply?.({ parentId: c.id, username: r.author.username })}
                              >
                                Reply
                              </button>
                              {canDeleteReply && (
                                <button
                                  className="comment__delete"
                                  onClick={() => deleteComment(r.id, c.id)}
                                  title="Delete reply"
                                  aria-label="Delete reply"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className={`comment__like-btn${r.liked ? ' is-liked' : ''}`}
                            onClick={() => toggleCommentLike(r, c.id)}
                            aria-label={r.liked ? 'Unlike reply' : 'Like reply'}
                            title={r.liked ? 'Unlike' : 'Like'}
                          >
                            <Heart size={13} fill={r.liked ? 'currentColor' : 'none'} />
                            {r.likeCount > 0 && <span>{r.likeCount}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CommentComposer({ postId, onPosted, replyTarget, replyUser, onReplyHandled, onCancelReply }) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // Normalize reply target: either object { parentId, username } or legacy string username
  const activeTarget = replyTarget || (replyUser ? { parentId: null, username: replyUser } : null);

  useEffect(() => {
    if (activeTarget?.username) {
      setBody((prev) => {
        const mention = `@${activeTarget.username} `;
        if (prev.startsWith(mention)) return prev;
        return `${mention}${prev}`;
      });
      inputRef.current?.focus();
      onReplyHandled?.();
    }
  }, [activeTarget?.username, onReplyHandled]);

  const submit = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const payload = { body: text };
      if (activeTarget?.parentId) {
        payload.parentId = activeTarget.parentId;
      }
      await api(`/posts/${postId}/comments`, { method: 'POST', body: payload });
      setBody('');
      const submittedParentId = activeTarget?.parentId;
      onCancelReply?.();
      onPosted?.(submittedParentId);
    } catch (err) {
      toast.show(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="composer-wrap">
      {activeTarget?.username && (
        <div className="reply-banner">
          <CornerDownRight size={14} className="muted" />
          <span className="small muted">
            Replying to <strong>@{activeTarget.username}</strong>
          </span>
          <button
            type="button"
            className="reply-banner__cancel"
            onClick={onCancelReply}
            aria-label="Cancel reply"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <form className="composer" onSubmit={submit}>
        <label className="sr-only" htmlFor={`comment-${postId}`}>Add a comment</label>
        <input
          ref={inputRef}
          id={`comment-${postId}`}
          className="input"
          placeholder={activeTarget?.username ? `Reply to @${activeTarget.username}…` : 'Add a comment…'}
          maxLength={500}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button className="btn btn--primary btn--sm" disabled={!body.trim() || busy}>
          {busy ? 'Posting…' : 'Post'}
        </button>
      </form>
    </div>
  );
}
