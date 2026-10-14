// Notifications: likes, comments and new followers. Opening the page marks everything as read.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, UserPlus, Bell } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/Feedback.jsx';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';

const COPY = {
  like: { icon: Heart, text: 'liked your post' },
  comment: { icon: MessageCircle, text: 'commented on your post' },
  follow: { icon: UserPlus, text: 'started following you' },
};

export default function Notifications() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/notifications')
      .then((d) => { setData(d); return d.unread ? api('/notifications/read', { method: 'POST' }) : null; })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <div className="center-pad"><Spinner /></div>;

  return (
    <div className="notifications fade-up">
      <h1 className="page-title">Notifications</h1>
      {data.items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet">Likes, comments and new followers will show up here.</EmptyState>
      ) : (
        <ul className="notif-list">
          {data.items.map((n) => {
            const { icon: Icon, text } = COPY[n.type];
            const to = n.postId ? `/p/${n.postId}` : `/u/${n.actor.username}`;
            return (
              <li key={n.id} className={`notif${n.read ? '' : ' is-unread'}`}>
                <Link to={`/u/${n.actor.username}`} aria-label={`@${n.actor.username}`}><Avatar user={n.actor} size={44} /></Link>
                <Link to={to} className="notif__text">
                  <span><span className="strong">@{n.actor.username}</span> {text}</span>
                  <span className="muted small"><Icon size={12} /> {timeAgo(n.createdAt)}</span>
                </Link>
                {n.thumbUrl && <Link to={to} className="notif__thumb" aria-label="Open post"><img src={n.thumbUrl} alt="" /></Link>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
