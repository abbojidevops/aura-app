// Home: the MindFeed. Pick a mood, tune the weights, and the feed pauses for you after every 10 posts.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, BookOpen, Smile, Leaf, TrendingUp, Target, Dices, SlidersHorizontal, UserPlus, Pause } from 'lucide-react';
import PostCard from '../components/PostCard.jsx';
import TuneFeed from '../components/TuneFeed.jsx';
import { PostSkeleton, EmptyState, ErrorState, Spinner } from '../components/Feedback.jsx';
import { useFeed } from '../lib/useFeed';
import { api } from '../lib/api';
import { useToast } from '../lib/context.jsx';

const BATCH = 10;
const MOOD_ICONS = { inspire: Sparkles, educate: BookOpen, entertain: Smile, calm: Leaf, trending: TrendingUp, interests: Target, surprise: Dices };
const TABS = [{ id: 'home', label: 'For you' }, { id: 'following', label: 'Following' }];
const PAUSE_KEY = 'aura-pause-until';

export default function Home() {
  const [tab, setTab] = useState('home');
  const [prefs, setPrefs] = useState(null);
  const [tuneOpen, setTuneOpen] = useState(false);
  const [pausedUntil, setPausedUntil] = useState(() => Number(localStorage.getItem(PAUSE_KEY) || 0));
  const [dismissed, setDismissed] = useState(() => new Set());
  const feed = useFeed(tab);
  const sentinel = useRef(null);
  const toast = useToast();

  useEffect(() => {
    api('/me/feed-settings').then(setPrefs).catch(() => {});
  }, []);

  const changeMood = async (mood) => {
    if (!prefs || prefs.settings.mood === mood) return;
    setPrefs((p) => ({ ...p, settings: { ...p.settings, mood } }));
    try {
      const res = await api('/me/feed-settings', { method: 'PATCH', body: { mood } });
      setPrefs((p) => ({ ...p, settings: res.settings }));
      feed.reload();
    } catch (err) {
      toast.show(err.message);
    }
  };

  // Infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && feed.loadMore(), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [feed.loadMore, feed.items?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const pauseFor = useCallback((minutes) => {
    const until = Date.now() + minutes * 60_000;
    localStorage.setItem(PAUSE_KEY, String(until));
    setPausedUntil(until);
  }, []);

  const resume = () => {
    localStorage.removeItem(PAUSE_KEY);
    setPausedUntil(0);
  };

  const paused = pausedUntil > Date.now();
  const MoodIcon = prefs ? MOOD_ICONS[prefs.settings.mood] || Sparkles : Sparkles;

  return (
    <div className="feed">
      <div className="feed__top">
        <div className="feed__tabs" role="tablist" aria-label="Feed">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn btn--sm" onClick={() => setTuneOpen(true)} disabled={!prefs}>
          <SlidersHorizontal size={16} /> Tune
        </button>
      </div>

      {prefs && tab === 'home' && (
        <div className="moods" role="radiogroup" aria-label="Mood mode">
          {prefs.moods.map((m) => {
            const Icon = MOOD_ICONS[m.id] || Sparkles;
            const on = prefs.settings.mood === m.id;
            return (
              <button key={m.id} role="radio" aria-checked={on} className={`mood${on ? ' is-on' : ''}`} onClick={() => changeMood(m.id)}>
                <Icon size={15} /> {m.label}
              </button>
            );
          })}
        </div>
      )}

      {tab === 'home' && prefs && (
        <p className="feed__hint muted small"><MoodIcon size={13} /> Showing posts for <strong>{prefs.moods.find((m) => m.id === prefs.settings.mood)?.label}</strong>. Tap a post’s “Why” to see the reasons.</p>
      )}

      {paused ? (
        <div className="card pause fade-up">
          <Pause size={28} />
          <h2 className="section-title">Feed paused</h2>
          <p className="muted">You asked for a break. Your feed returns at {new Date(pausedUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>
          <button className="btn" onClick={resume}>Resume now</button>
        </div>
      ) : (
        <>
          {feed.items === null && !feed.error && (
            <>
              <PostSkeleton />
              <PostSkeleton />
            </>
          )}

          {feed.error && <ErrorState message={feed.error} onRetry={feed.reload} />}

          {feed.items?.length === 0 && (
            tab === 'following' ? (
              <EmptyState icon={UserPlus} title="Nothing from people you follow yet" action={<Link className="btn btn--primary" to="/explore">Find creators</Link>}>
                Follow a few creators and their posts will appear here.
              </EmptyState>
            ) : (
              <EmptyState title="No posts for this mood yet">Try another mood, or check back soon.</EmptyState>
            )
          )}

          {feed.items?.map((post, i) => (
            <div key={post.id}>
              <PostCard post={post} reasons={post.reasons} patch={(changes) => feed.patch(post.id, changes)} onDeleted={feed.remove} />
              {(i + 1) % BATCH === 0 && !dismissed.has(i) && (
                <div className="card batch-break fade-up">
                  <p><strong>You’ve seen {i + 1} posts.</strong> Want a moment before the next batch?</p>
                  <div className="row">
                    <button className="btn btn--sm" onClick={() => setDismissed((d) => new Set(d).add(i))}>Keep going</button>
                    <button className="btn btn--sm btn--primary" onClick={() => pauseFor(10)}>Pause 10 minutes</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div ref={sentinel} className="feed__end">
            {feed.loading && feed.items?.length > 0 && <Spinner />}
            {!feed.hasMore && feed.items?.length > 0 && <p className="muted small">You’re all caught up for now.</p>}
          </div>
        </>
      )}

      <TuneFeed open={tuneOpen} onClose={() => setTuneOpen(false)} settings={prefs?.settings} onSaved={(s) => { setPrefs((p) => ({ ...p, settings: s })); feed.reload(); }} />
    </div>
  );
}
