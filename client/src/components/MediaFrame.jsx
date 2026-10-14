// Media player for photos and videos. Videos autoplay when active, loop, and toggle play/pause on tap.
// Double-tap (or double-click) triggers onDoubleTap and shows a heart burst.
import { useEffect, useRef, useState } from 'react';
import { Play, Heart, AlertTriangle } from 'lucide-react';

export default function MediaFrame({ post, active = false, muted = true, onDoubleTap, fit = 'cover', className = '' }) {
  const videoRef = useRef(null);
  const lastTap = useRef(0);
  const tapTimer = useRef(null);
  const [burst, setBurst] = useState(0);
  const [paused, setPaused] = useState(false);
  const ratio = post.width && post.height ? post.width / post.height : post.mediaType === 'video' ? 9 / 16 : 4 / 5;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.play().then(() => setPaused(false)).catch(() => setPaused(true));
    } else {
      v.pause();
    }
  }, [active]);

  if (post.status !== 'published' || !post.mediaUrl) {
    return (
      <div className={`media media--state ${className}`} style={{ aspectRatio: ratio }}>
        {post.status === 'failed' ? (
          <div className="media__msg"><AlertTriangle size={22} /><span>We couldn’t process this file.</span></div>
        ) : (
          <div className="media__msg"><span className="spinner" /><span>Processing your upload…</span></div>
        )}
      </div>
    );
  }

  const handlePointerUp = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      // Double tap: cancel any pending single-tap toggle and like.
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      setBurst((b) => b + 1);
      onDoubleTap?.();
      return;
    }
    lastTap.current = now;
    if (post.mediaType === 'video') {
      // Single tap toggles playback after a short wait, so a double-tap doesn't also pause the video.
      tapTimer.current = setTimeout(() => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) { v.play(); setPaused(false); } else { v.pause(); setPaused(true); }
      }, 300);
    }
  };

  return (
    <div
      className={`media ${className}`}
      style={{ aspectRatio: ratio }}
      onPointerUp={handlePointerUp}
    >
      {post.mediaType === 'video' ? (
        <video
          ref={videoRef}
          src={post.mediaUrl}
          poster={post.thumbUrl || undefined}
          loop
          playsInline
          muted={muted}
          preload={active ? 'auto' : 'metadata'}
          aria-label={post.caption || `Video by @${post.author.username}`}
        />
      ) : (
        <img src={post.mediaUrl} alt={post.caption || `Photo by @${post.author.username}`} loading="lazy" decoding="async" />
      )}
      {post.mediaType === 'video' && paused && (
        <span className="media__play" aria-hidden="true"><Play size={30} fill="currentColor" /></span>
      )}
      {burst > 0 && (
        <span key={burst} className="media__burst" aria-hidden="true"><Heart size={96} fill="currentColor" /></span>
      )}
    </div>
  );
}
