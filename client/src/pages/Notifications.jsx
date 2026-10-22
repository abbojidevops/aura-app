// Notifications: likes, comments, new followers, follow requests, and mentions with realtime updates.
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, UserPlus, Bell, Check, X, AtSign, CheckCheck } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/Feedback.jsx';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useToast } from '../lib/context.jsx';
import { subscribeRealtime } from '../lib/realtime';

const COPY = {
  like: { icon: Heart, text: 'liked your post' },
  comment: { icon: MessageCircle, text: 'commented on your post' },
  follow: { icon: UserPlus, text: 'started following you' },
  follow_request: { icon: UserPlus, text: 'requested to follow you' },
  mention: { icon: AtSign, text: 'mentioned you' },
  reply: { icon: MessageCircle, text: 'replied to your comment' },
};

export default function Notifications() {
  const [data, setData] = useState(null);
  const [followRequests, setFollowRequests] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all' | 'mentions' | 'comments' | 'likes' | 'follows'
  const [error, setError] = useState('');
  const toast = useToast();

  const load = useCallback(() => {
    Promise.all([
      api('/notifications')
        .then((d) => {
          setData(d);
          return d.unread ? api('/notifications/read', { method: 'POST' }) : null;
        }),
      api('/me/follow-requests')
        .then((d) => setFollowRequests(d.requests || d.items || []))
        .catch(() => setFollowRequests([])),
    ]).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime notification ingestion
  useEffect(() => {
    return subscribeRealtime((msg) => {
      if (msg.type === 'notification') {
        if (msg.notification) {
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  unread: 0,
                  items: [msg.notification, ...(prev.items || []).filter((i) => i.id !== msg.notification.id)],
                }
              : prev
          );
        } else {
          load();
        }
      }
    });
  }, [load]);

  const markAllRead = async () => {
    try {
      await api('/notifications/read', { method: 'POST' });
      setData((prev) => (prev ? { ...prev, unread: 0, items: (prev.items || []).map((i) => ({ ...i, read: true })) } : prev));
      toast.show('All marked as read');
    } catch (err) {
      toast.show(err.message);
    }
  };

  const handleAccept = async (username) => {
    try {
      await api(`/me/follow-requests/${username}/accept`, { method: 'POST' });
      setFollowRequests((prev) => prev.filter((r) => r.username !== username));
      toast.show(`Accepted follow request from @${username}`);
    } catch (err) {
      toast.show(err.message);
    }
  };

  const handleDecline = async (username) => {
    try {
      await api(`/me/follow-requests/${username}/decline`, { method: 'POST' });
      setFollowRequests((prev) => prev.filter((r) => r.username !== username));
      toast.show(`Declined follow request from @${username}`);
    } catch (err) {
      toast.show(err.message);
    }
  };

  if (error) return <ErrorState message={error} />;
  if (!data) return <div className="center-pad"><Spinner /></div>;

  const filteredItems = (data.items || []).filter((n) => {
    if (filter === 'all') return true;
    if (filter === 'mentions') return n.type === 'mention';
    if (filter === 'comments') return n.type === 'comment' || n.type === 'reply';
    if (filter === 'likes') return n.type === 'like';
    if (filter === 'follows') return n.type === 'follow' || n.type === 'follow_request';
    return true;
  });

  return (
    <div className="notifications fade-up">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Notifications</h1>
        {data.items?.some((n) => !n.read) && (
          <button className="btn btn--sm" onClick={markAllRead}>
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>

      <div className="segmented" role="tablist" style={{ marginBottom: 16 }}>
        <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>All</button>
        <button role="tab" aria-selected={filter === 'mentions'} className={filter === 'mentions' ? 'is-on' : ''} onClick={() => setFilter('mentions')}>Mentions</button>
        <button role="tab" aria-selected={filter === 'comments'} className={filter === 'comments' ? 'is-on' : ''} onClick={() => setFilter('comments')}>Comments</button>
        <button role="tab" aria-selected={filter === 'likes'} className={filter === 'likes' ? 'is-on' : ''} onClick={() => setFilter('likes')}>Likes</button>
        <button role="tab" aria-selected={filter === 'follows'} className={filter === 'follows' ? 'is-on' : ''} onClick={() => setFilter('follows')}>Follows</button>
      </div>

      {followRequests.length > 0 && filter === 'all' && (
        <section className="card notif-requests" style={{ marginBottom: 16 }}>
          <h2 className="section-title" style={{ fontSize: 16, marginBottom: 10 }}>
            Follow Requests ({followRequests.length})
          </h2>
          <ul className="stack" style={{ gap: 10 }}>
            {followRequests.map((fr) => (
              <li key={fr.id || fr.username} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <Link to={`/u/${fr.username}`} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                  <Avatar user={fr} size={40} />
                  <div>
                    <div className="strong" style={{ fontSize: 14 }}>@{fr.username}</div>
                    <div className="muted small">{fr.displayName}</div>
                  </div>
                </Link>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn--primary btn--sm" onClick={() => handleAccept(fr.username)}>
                    <Check size={14} /> Accept
                  </button>
                  <button className="btn btn--sm" onClick={() => handleDecline(fr.username)}>
                    <X size={14} /> Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {filteredItems.length === 0 && (followRequests.length === 0 || filter !== 'all') ? (
        <EmptyState icon={Bell} title={filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}>
          {filter === 'all' ? 'Likes, comments and new followers will show up here.' : `You have no ${filter} notifications right now.`}
        </EmptyState>
      ) : (
        <ul className="notif-list">
          {filteredItems.map((n) => {
            const { icon: Icon, text } = COPY[n.type] || { icon: Bell, text: 'sent an update' };
            const to = n.postId ? `/p/${n.postId}` : `/u/${n.actor.username}`;
            const isPendingRequest = n.type === 'follow_request' && followRequests.some((fr) => fr.username === n.actor.username);
            return (
              <li key={n.id} className={`notif${n.read ? '' : ' is-unread'}`}>
                <Link to={`/u/${n.actor.username}`} aria-label={`@${n.actor.username}`}><Avatar user={n.actor} size={44} /></Link>
                <Link to={to} className="notif__text">
                  <span><span className="strong">@{n.actor.username}</span> {text}</span>
                  <span className="muted small"><Icon size={12} /> {timeAgo(n.createdAt)}</span>
                </Link>
                {isPendingRequest ? (
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    <button className="btn btn--primary btn--sm" onClick={(e) => { e.preventDefault(); handleAccept(n.actor.username); }}>
                      <Check size={14} />
                    </button>
                    <button className="btn btn--sm" onClick={(e) => { e.preventDefault(); handleDecline(n.actor.username); }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : n.thumbUrl ? (
                  <Link to={to} className="notif__thumb" aria-label="Open post"><img src={n.thumbUrl} alt="" /></Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
