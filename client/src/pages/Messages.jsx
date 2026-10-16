// Direct messages: conversation list + thread. New messages arrive over WebSocket (/ws), with polling as a fallback.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Send, MessageCircle } from 'lucide-react';
import Avatar from '../components/Avatar.jsx';
import { EmptyState, Spinner } from '../components/Feedback.jsx';
import { api } from '../lib/api';
import { subscribeRealtime, useRealtimeLive, sendRealtime } from '../lib/realtime';
import { timeAgo } from '../lib/format';
import { useToast } from '../lib/context.jsx';

export default function Messages() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [convos, setConvos] = useState(null);
  const [newName, setNewName] = useState('');

  const loadConvos = useCallback(() => {
    api('/messages').then((d) => setConvos(d.conversations)).catch(() => {});
  }, []);

  const live = useRealtimeLive();

  // Realtime when connected; slower polling as a safety net; faster polling when offline.
  useEffect(() => {
    loadConvos();
    const t = setInterval(loadConvos, live ? 30000 : 8000);
    return () => clearInterval(t);
  }, [loadConvos, live]);

  useEffect(() => subscribeRealtime((m) => { if (m.type === 'message') loadConvos(); }), [loadConvos]);

  const startChat = async (e) => {
    e.preventDefault();
    const username = newName.trim().replace(/^@/, '');
    if (!username) return;
    try {
      const res = await api('/messages/start', { method: 'POST', body: { username } });
      setNewName('');
      navigate(`/messages/${res.id}`);
      loadConvos();
    } catch (err) {
      toast.show(err.message);
    }
  };

  const active = convos?.find((c) => String(c.id) === String(id));

  return (
    <div className={`messages${id ? ' messages--thread' : ''}`}>
      <aside className="messages__list" aria-label="Conversations">
        <h1 className="page-title">Messages</h1>
        <form className="new-chat" onSubmit={startChat}>
          <label className="sr-only" htmlFor="new-chat">Start a chat with a username</label>
          <input id="new-chat" className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Start a chat: @username" />
          <button className="btn btn--sm" disabled={!newName.trim()}>Chat</button>
        </form>
        {convos === null && <div className="center-pad"><Spinner /></div>}
        {convos?.length === 0 && <EmptyState icon={MessageCircle} title="No conversations yet">Start one with a username above.</EmptyState>}
        <ul className="convo-list">
          {convos?.map((c) => (
            <li key={c.id}>
              <Link to={`/messages/${c.id}`} className={`convo${String(c.id) === String(id) ? ' is-active' : ''}`}>
                <Avatar user={c.user} size={44} />
                <span className="convo__text">
                  <span className="strong">{c.user.displayName}</span>
                  <span className="muted small truncate">{c.lastBody || 'Say hello 👋'}</span>
                </span>
                <span className="convo__meta">
                  {c.lastAt && <span className="muted small">{timeAgo(c.lastAt)}</span>}
                  {c.unread > 0 && <span className="badge badge--inline">{c.unread}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="messages__thread" aria-label="Conversation">
        {id && active ? (
          <Thread key={id} id={id} other={active.user} />
        ) : id ? (
          <div className="center-pad"><Spinner /></div>
        ) : (
          <EmptyState icon={MessageCircle} title="Select a conversation">Your direct messages appear here.</EmptyState>
        )}
      </section>
    </div>
  );
}

function Thread({ id, other }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const lastId = useRef(0);
  const list = useRef(null);

  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(0);

  const fetchNew = useCallback(async () => {
    const d = await api(`/messages/${id}?after=${lastId.current}`);
    if (d.messages.length) {
      setMessages((m) => [...m, ...d.messages]);
      lastId.current = d.messages[d.messages.length - 1].id;
    }
    setLoaded(true);
  }, [id]);

  const live = useRealtimeLive();

  useEffect(() => {
    fetchNew().catch(() => setLoaded(true));
    const t = setInterval(() => fetchNew().catch(() => {}), live ? 30000 : 3000);
    return () => clearInterval(t);
  }, [fetchNew, live]);

  useEffect(() => subscribeRealtime((m) => {
    if (m.type === 'message' && String(m.conversationId) === String(id)) {
      setOtherTyping(false);
      fetchNew().catch(() => {});
    }
    if (m.type === 'typing' && String(m.conversationId) === String(id) && m.userId === other.id) {
      setOtherTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setOtherTyping(false), 3500);
    }
  }), [fetchNew, id, other.id]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, otherTyping]);

  const handleInputChange = (e) => {
    setText(e.target.value);
    const now = Date.now();
    if (now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      sendRealtime({ type: 'typing', conversationId: Number(id) });
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    const optimistic = { id: `tmp-${Date.now()}`, mine: true, body, createdAt: new Date().toISOString(), pending: true };
    setMessages((m) => [...m, optimistic]);
    try {
      await api(`/messages/${id}`, { method: 'POST', body: { body } });
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      await fetchNew();
    } catch (err) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setText(body);
      toast.show(err.message);
    }
  };

  return (
    <div className="thread">
      <header className="thread__head">
        <button className="icon-btn thread__back" onClick={() => navigate('/messages')} aria-label="Back to conversations">←</button>
        <Link to={`/u/${other.username}`} className="thread__who">
          <Avatar user={other} size={36} />
          <div>
            <span className="strong block">{other.displayName}</span>
            {otherTyping && <span className="muted small typing-status">typing…</span>}
          </div>
        </Link>
      </header>

      <div className="thread__messages" ref={list} role="log" aria-live="polite">
        {!loaded && <div className="center-pad"><Spinner /></div>}
        {loaded && messages.length === 0 && <p className="muted center-pad">No messages yet. Say hello.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`bubble-row${m.mine ? ' is-mine' : ''}`}>
            <div className={`bubble${m.mine ? ' bubble--mine' : ''}${m.pending ? ' is-pending' : ''} fade-up`}>
              {m.body}
            </div>
          </div>
        ))}
        {otherTyping && (
          <div className="bubble-row fade-up">
            <div className="bubble bubble--typing">
              <span className="dots-typing">
                <span /><span /><span />
              </span>
            </div>
          </div>
        )}
      </div>

      <form className="thread__composer" onSubmit={send}>
        <label className="sr-only" htmlFor="message-input">Message</label>
        <input id="message-input" className="input" value={text} maxLength={1000} onChange={handleInputChange} placeholder="Message…" />
        <button className="btn btn--primary btn--icon" disabled={!text.trim()} aria-label="Send message"><Send size={18} /></button>
      </form>
    </div>
  );
}
