// Notifications: likes, comments, new followers, and follow requests.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, UserPlus, Bell, Check, X } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/Feedback.jsx';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { useToast } from '../lib/context.jsx';

const COPY = {
  like: { icon: Heart, text: 'liked your post' },
  comment: { icon: MessageCircle, text: 'commented on your post' },
  follow: { icon: UserPlus, text: 'started following you' },
  follow_request: { icon: UserPlus, text: 'requested to follow you' },
};

export default function Notifications() {
  const [data, setData] = useState(null);
  const [followRequests, setFollowRequests] = useState([]);
  const [error, setError] = useState('');
  const toast = useToast();

  useEffect(() => {
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

  return (
    <div className="notifications fade-up">
      <h1 className="page-title">Notifications</h1>

      {followRequests.length > 0 && (
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

      {data.items.length === 0 && followRequests.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet">Likes, comments and new followers will show up here.</EmptyState>
      ) : (
        <ul className="notif-list">
          {data.items.map((n) => {
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
