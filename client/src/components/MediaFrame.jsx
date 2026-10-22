// Media player for photos, videos, and multi-image carousels.
// Videos autoplay when active, loop, and toggle play/pause on tap.
// Carousels support snap-scrolling, navigation arrows, dots, and image counter badge.
// Double-tap triggers onDoubleTap and shows a heart burst.
import { useEffect, useRef, useState } from 'react';
import { Play, Heart, AlertTriangle, ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react';

export default function MediaFrame({ post, active = false, muted = true, onDoubleTap, fit = 'cover', className = '' }) {
  const videoRef = useRef(null);
  const trackRef = useRef(null);
  const lastTap = useRef(0);
  const tapTimer = useRef(null);
  const [burst, setBurst] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [currentSlide, setCurrentSlide] = useState(0);

  const isCarousel = post.mediaType === 'carousel' || (Array.isArray(post.mediaList) && post.mediaList.length > 1);
  const items = isCarousel && post.mediaList?.length ? post.mediaList : null;

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

  if (post.status !== 'published' || (!post.mediaUrl && (!items || !items.length))) {
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
      clearTimeout(tapTimer.current);
      lastTap.current = 0;
      setBurst((b) => b + 1);
      onDoubleTap?.();
      return;
    }
    lastTap.current = now;
    if (post.mediaType === 'video') {
      tapTimer.current = setTimeout(() => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) { v.play(); setPaused(false); } else { v.pause(); setPaused(true); }
      }, 300);
    }
  };

  const handleScroll = () => {
    const el = trackRef.current;
    if (!el || !items) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    if (index !== currentSlide && index >= 0 && index < items.length) {
      setCurrentSlide(index);
    }
  };

  const goToSlide = (index, e) => {
    e?.stopPropagation();
    e?.preventDefault();
    const el = trackRef.current;
    if (!el || !items) return;
    const clamped = Math.max(0, Math.min(index, items.length - 1));
    setCurrentSlide(clamped);
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div
      className={`media ${isCarousel ? 'media--carousel' : ''} ${className}`}
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
          muted={isMuted}
          preload={active ? 'auto' : 'metadata'}
          aria-label={post.caption || `Video by @${post.author?.username}`}
        />
      ) : isCarousel && items ? (
        <>
          <div
            ref={trackRef}
            className="media__track"
            onScroll={handleScroll}
            tabIndex={0}
            role="region"
            aria-label="Image carousel"
          >
            {items.map((item, idx) => (
              <div key={idx} className="media__slide">
                <img
                  src={item.mediaUrl}
                  alt={post.caption || `Photo ${idx + 1} of ${items.length} by @${post.author?.username}`}
                  loading={idx === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              </div>
            ))}
          </div>

          <span className="media__counter" aria-label={`Photo ${currentSlide + 1} of ${items.length}`}>
            {currentSlide + 1}/{items.length}
          </span>

          {currentSlide > 0 && (
            <button
              type="button"
              className="media__nav-btn media__nav-btn--prev"
              onClick={(e) => goToSlide(currentSlide - 1, e)}
              aria-label="Previous photo"
            >
              <ChevronLeft size={20} />
            </button>
          )}

          {currentSlide < items.length - 1 && (
            <button
              type="button"
              className="media__nav-btn media__nav-btn--next"
              onClick={(e) => goToSlide(currentSlide + 1, e)}
              aria-label="Next photo"
            >
              <ChevronRight size={20} />
            </button>
          )}

          <div className="media__dots" aria-hidden="true">
            {items.map((_, idx) => (
              <span
                key={idx}
                className={`media__dot${idx === currentSlide ? ' is-active' : ''}`}
                onClick={(e) => goToSlide(idx, e)}
              />
            ))}
          </div>
        </>
      ) : (
        <img src={post.mediaUrl} alt={post.caption || `Photo by @${post.author?.username}`} loading="lazy" decoding="async" />
      )}
      {post.mediaType === 'video' && paused && (
        <span className="media__play" aria-hidden="true"><Play size={30} fill="currentColor" /></span>
      )}
      {post.mediaType === 'video' && (
        <button
          type="button"
          className="media__audio-toggle"
          aria-label={isMuted ? 'Unmute video' : 'Mute video'}
          title={isMuted ? 'Unmute video' : 'Mute video'}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setIsMuted((prev) => !prev);
          }}
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      )}
      {burst > 0 && (
        <span key={burst} className="media__burst" aria-hidden="true"><Heart size={96} fill="currentColor" /></span>
      )}
    </div>
  );
}
