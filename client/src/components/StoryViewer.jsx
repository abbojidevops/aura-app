import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Trash2, Eye } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useToast } from '../lib/context.jsx';

const STORY_DURATION_MS = 5000;

export default function StoryViewer({ groups, initialGroupIndex = 0, onClose, onStoryDeleted }) {
  const toast = useToast();
  const [groupIdx, setGroupIdx] = useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewers, setViewers] = useState(null);
  const [showViewers, setShowViewers] = useState(false);

  const group = groups[groupIdx];
  const story = group?.stories[storyIdx];

  // Advance to next story or next group
  const next = useCallback(() => {
    if (!group) return;
    if (storyIdx < group.stories.length - 1) {
      setStoryIdx((s) => s + 1);
      setProgress(0);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx((g) => g + 1);
      setStoryIdx(0);
      setProgress(0);
    } else {
      onClose();
    }
  }, [group, storyIdx, groupIdx, groups.length, onClose]);

  // Go back to previous story or previous group
  const prev = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx((s) => s - 1);
      setProgress(0);
    } else if (groupIdx > 0) {
      setGroupIdx((g) => g - 1);
      setStoryIdx(groups[groupIdx - 1].stories.length - 1);
      setProgress(0);
    }
  }, [storyIdx, groupIdx, groups]);

  // Mark viewed when story is shown
  useEffect(() => {
    if (story && !story.viewed) {
      api(`/stories/${story.id}/view`, { method: 'POST' }).catch(() => {});
      story.viewed = true;
    }
  }, [story]);

  // Load viewers if own story
  useEffect(() => {
    if (group?.author.isMe && story) {
      api(`/stories/${story.id}/views`)
        .then((d) => setViewers(d.viewers))
        .catch(() => setViewers([]));
    } else {
      setViewers(null);
    }
    setShowViewers(false);
  }, [group, story]);

  // Progress timer for stories
  useEffect(() => {
    if (!story || paused) return undefined;
    const interval = 50;
    const step = (interval / STORY_DURATION_MS) * 100;
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          next();
          return 0;
        }
        return p + step;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [story, paused, next]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  if (!group || !story) return null;

  const removeStory = async () => {
    if (!window.confirm('Delete this story?')) return;
    try {
      await api(`/stories/${story.id}`, { method: 'DELETE' });
      toast.show('Story deleted');
      onStoryDeleted?.(story.id);
      if (group.stories.length > 1) {
        next();
      } else {
        onClose();
      }
    } catch (err) {
      toast.show(err.message);
    }
  };

  return (
    <div
      className="story-viewer-backdrop fade-up"
      onMouseDown={() => setPaused(true)}
      onMouseUp={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Story viewer"
    >
      <div className="story-viewer">
        {/* Top Progress bar */}
        <div className="story-progress">
          {group.stories.map((s, idx) => (
            <div key={s.id} className="story-progress__seg">
              <div
                className={`story-progress__fill${idx < storyIdx ? ' is-done' : ''}`}
                style={{ width: idx === storyIdx ? `${progress}%` : undefined }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="story-viewer__head">
          <div className="story-viewer__user">
            <Avatar user={group.author} size={36} ring />
            <div>
              <span className="strong block small">{group.author.displayName}</span>
              <span className="small muted" style={{ color: 'rgba(255,255,255,0.7)' }}>{timeAgo(story.createdAt)}</span>
            </div>
          </div>
          <div className="story-viewer__actions">
            {group.author.isMe && viewers !== null && (
              <button
                className="btn btn--sm"
                style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', padding: '0 8px', height: 32 }}
                onClick={(e) => { e.stopPropagation(); setShowViewers((v) => !v); }}
                title="Viewers"
              >
                <Eye size={16} /> {viewers.length}
              </button>
            )}
            {group.author.isMe && (
              <button
                className="icon-btn"
                style={{ color: '#fff' }}
                onClick={(e) => { e.stopPropagation(); removeStory(); }}
                aria-label="Delete story"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button
              className="icon-btn"
              style={{ color: '#fff' }}
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              aria-label="Close stories"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Media content */}
        <div className="story-viewer__media">
          {story.mediaType === 'video' ? (
            <video
              src={story.mediaUrl}
              autoPlay
              playsInline
              muted={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onEnded={next}
            />
          ) : (
            <img src={story.mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          )}

          {/* Navigation touch zones */}
          <button className="story-nav-btn story-nav-btn--left" onClick={(e) => { e.stopPropagation(); prev(); }} aria-label="Previous story" />
          <button className="story-nav-btn story-nav-btn--right" onClick={(e) => { e.stopPropagation(); next(); }} aria-label="Next story" />
        </div>

        {/* Caption */}
        {story.caption && (
          <div className="story-viewer__caption">
            {story.caption}
          </div>
        )}

        {/* Viewers modal sheet if open */}
        {showViewers && (
          <div
            style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.92)',
              zIndex: 20, padding: '48px 16px 16px', overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 className="section-title" style={{ color: '#fff', margin: 0 }}>Viewed by ({viewers?.length || 0})</h3>
              <button className="icon-btn" style={{ color: '#fff' }} onClick={() => setShowViewers(false)}>
                <X size={20} />
              </button>
            </div>
            {viewers?.length === 0 ? (
              <p className="muted center-pad">No views yet.</p>
            ) : (
              <div className="stack-sm">
                {viewers?.map((v) => (
                  <div key={v.id} className="person-row">
                    <div className="person">
                      <Avatar user={v} size={36} />
                      <div className="person__names">
                        <span className="strong" style={{ color: '#fff' }}>{v.displayName}</span>
                        <span className="muted small">@{v.username} · {timeAgo(v.viewedAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
