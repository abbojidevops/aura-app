// Reels: full-screen vertical video with snap scrolling, a right-hand action rail, and keyboard support.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Send, Bookmark, Volume2, VolumeX, Plus } from 'lucide-react';
import MediaFrame from '../components/MediaFrame.jsx';
import Avatar from '../components/Avatar.jsx';
import Sheet from '../components/Sheet.jsx';
import { CommentList, CommentComposer } from '../components/Comments.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/Feedback.jsx';
import { CaptionText } from '../components/PostCard.jsx';
import { useFeed } from '../lib/useFeed';
import { useAuth, useToast } from '../lib/context.jsx';
import { toggleLike, toggleSave, sharePost } from '../lib/actions';
import { api } from '../lib/api';
import { formatCount } from '../lib/format';
import { Clapperboard } from 'lucide-react';

export default function Reels() {
  const feed = useFeed('reels');
  const { user } = useAuth();
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [commentsFor, setCommentsFor] = useState(null);
  const [commentsKey, setCommentsKey] = useState(0);
  const refs = useRef([]);
  const scroller = useRef(null);

  const goTo = useCallback((i) => {
    refs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // The reel that is more than 60% visible is the active one (drives video playback).
  useEffect(() => {
    if (!scroller.current || !feed.items?.length) return undefined;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setIndex(Number(en.target.dataset.index)); });
    }, { root: scroller.current, threshold: 0.6 });
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [feed.items?.length]);

  // Prefetch the next page when the viewer is two reels from the end.
  useEffect(() => {
    if (feed.items && index >= feed.items.length - 2) feed.loadMore();
  }, [index, feed.items, feed.loadMore]);

  // Keyboard: ↑/↓ or K/J to move between reels, M to mute.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return;
      if (e.key === 'ArrowDown' || e.key === 'j') goTo(index + 1);
      if (e.key === 'ArrowUp' || e.key === 'k') goTo(index - 1);
      if (e.key === 'm') setMuted((m) => !m);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, goTo]);

  if (feed.error && !feed.items) return <ErrorState message={feed.error} onRetry={feed.reload} />;
  if (feed.items === null) return <div className="reels-loading"><Spinner label="Loading reels" /></div>;
  if (feed.items.length === 0) {
    return <EmptyState icon={Clapperboard} title="No reels yet">Upload a short video from Create to start the reel feed.</EmptyState>;
  }

  const current = feed.items[index];

  return (
    <div className="reels" ref={scroller} aria-label="Reels">
      {feed.items.map((post, i) => {
        const isMine = user && post.author.id === user.id;
        return (
          <section key={post.id} className="reel" data-index={i} ref={(el) => (refs.current[i] = el)} aria-label={`Reel ${i + 1} by @${post.author.username}`}>
            <div className="reel__stage">
              <MediaFrame post={post} active={i === index} muted={muted} fit="contain" className="reel__media"
                onDoubleTap={() => !post.liked && toggleLike(post, (c) => feed.patch(post.id, c), toast)} />
            </div>

            <div className="reel__rail">
              <div className="reel__author">
                <Link to={`/u/${post.author.username}`} aria-label={`@${post.author.username}`}>
                  <Avatar user={post.author} size={48} ring />
                </Link>
                {!isMine && !post.author.followed && (
                  <button className="reel__follow" aria-label={`Follow @${post.author.username}`} onClick={async () => {
                    feed.patch(post.id, { author: { ...post.author, followed: true } });
                    try { await api(`/users/${post.author.username}/follow`, { method: 'POST' }); }
                    catch (err) { toast.show(err.message); feed.patch(post.id, { author: { ...post.author, followed: false } }); }
                  }}>
                    <Plus size={14} strokeWidth={3} />
                  </button>
                )}
              </div>
              <RailButton label={post.liked ? 'Unlike' : 'Like'} pressed={post.liked} count={formatCount(post.likeCount)}
                onClick={() => toggleLike(post, (c) => feed.patch(post.id, c), toast)}>
                <Heart size={30} fill={post.liked ? 'currentColor' : 'none'} className={post.liked ? 'is-liked' : ''} />
              </RailButton>
              <RailButton label="Comments" count={formatCount(post.commentCount)} onClick={() => setCommentsFor(post)}>
                <MessageCircle size={30} />
              </RailButton>
              <RailButton label="Share" onClick={() => sharePost(post, toast)}>
                <Send size={28} />
              </RailButton>
              <RailButton label={post.saved ? 'Remove from saved' : 'Save'} pressed={post.saved} onClick={() => toggleSave(post, (c) => feed.patch(post.id, c), toast)}>
                <Bookmark size={28} fill={post.saved ? 'currentColor' : 'none'} />
              </RailButton>
              <RailButton label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted((m) => !m)}>
                {muted ? <VolumeX size={26} /> : <Volume2 size={26} />}
              </RailButton>
            </div>

            <div className="reel__info">
              <Link to={`/u/${post.author.username}`} className="strong reel__handle">@{post.author.username}</Link>
              {post.caption && <p className="reel__caption"><CaptionText text={post.caption} /></p>}
              {post.reasons?.[0] && <p className="reel__why">{post.reasons[0]}</p>}
            </div>
          </section>
        );
      })}

      {feed.loading && <div className="reel__loading"><Spinner /></div>}

      <Sheet open={!!commentsFor} onClose={() => setCommentsFor(null)} title={commentsFor ? `Comments · ${formatCount(commentsFor.commentCount)}` : 'Comments'}>
        {commentsFor && (
          <>
            <CommentList key={`${commentsFor.id}-${commentsKey}`} postId={commentsFor.id} />
            <CommentComposer postId={commentsFor.id} onPosted={() => {
              feed.patch(commentsFor.id, { commentCount: commentsFor.commentCount + 1 });
              setCommentsFor((c) => ({ ...c, commentCount: c.commentCount + 1 }));
              setCommentsKey((k) => k + 1);
            }} />
          </>
        )}
      </Sheet>
      <span className="sr-only" aria-live="polite">{current ? `Reel ${index + 1} of ${feed.items.length}` : ''}</span>
    </div>
  );
}

function RailButton({ label, count, pressed, onClick, children }) {
  return (
    <button className="reel-btn" onClick={onClick} aria-label={label} aria-pressed={pressed === undefined ? undefined : pressed}>
      <span className="reel-btn__icon">{children}</span>
      {count !== undefined && <span className="reel-btn__count">{count}</span>}
    </button>
  );
}
