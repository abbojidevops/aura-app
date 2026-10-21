// Direct messages: conversation list + thread. New messages arrive over WebSocket (/ws), with polling as a fallback.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Send, MessageCircle, Mic, Play, Pause, Trash2 } from 'lucide-react';
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
        <ul className="convos">
          {convos?.map((c) => {
            const on = String(c.id) === String(id);
            return (
              <li key={c.id}>
                <Link to={`/messages/${c.id}`} className={`convo${on ? ' is-on' : ''}`}>
                  <Avatar user={c.other} size={44} ring={c.unread > 0} />
                  <div className="convo__body">
                    <div className="convo__row">
                      <span className="strong truncate">{c.other.displayName}</span>
                      {c.lastMessage && <span className="muted small">{timeAgo(c.lastMessage.createdAt)}</span>}
                    </div>
                    <div className="convo__row">
                      <span className="muted small truncate">
                        {c.lastMessage ? (c.lastMessage.mediaType === 'audio' ? '🎤 Voice note' : c.lastMessage.body) : `@${c.other.username}`}
                      </span>
                      {c.unread > 0 && <span className="badge">{c.unread}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="messages__main" aria-label="Current conversation">
        {id && active ? (
          <Thread id={id} other={active.other} />
        ) : (
          <div className="messages__placeholder">
            <MessageCircle size={48} className="muted" />
            <p className="muted">Pick a conversation or start a new one.</p>
          </div>
        )}
      </section>
    </div>
  );
}

const QUICK_EMOJIS = ['❤️', '😂', '👍', '🔥', '😮', '😢'];

function AudioPlayer({ src, duration: totalDuration, mine }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(totalDuration || 0);
  const audioRef = useRef(null);

  const toggle = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (!audioDuration && audioRef.current.duration) {
        setAudioDuration(audioRef.current.duration);
      }
    }
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const target = pos * (audioDuration || 1);
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const formatTime = (sec) => {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  };

  const progress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  return (
    <div className={`audio-bubble${mine ? ' audio-bubble--mine' : ''}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setAudioDuration(audioRef.current.duration || totalDuration || 0)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <button
        type="button"
        className="audio-bubble__play-btn"
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <div className="audio-bubble__track-wrap" onClick={handleSeek}>
        <div className="audio-bubble__track">
          <div className="audio-bubble__progress" style={{ width: `${progress}%` }} />
        </div>
        <div className="audio-bubble__meta">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(audioDuration || totalDuration)}</span>
        </div>
      </div>
    </div>
  );
}

function Thread({ id, other }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);

  const lastId = useRef(0);
  const list = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);

  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(0);

  const reloadAll = useCallback(async () => {
    const d = await api(`/messages/${id}`);
    setMessages(d.messages || []);
    if (d.messages?.length) {
      lastId.current = d.messages[d.messages.length - 1].id;
    }
    setLoaded(true);
  }, [id]);

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
    reloadAll().catch(() => setLoaded(true));
    const t = setInterval(() => fetchNew().catch(() => {}), live ? 30000 : 3000);
    return () => clearInterval(t);
  }, [reloadAll, fetchNew, live]);

  useEffect(() => subscribeRealtime((m) => {
    if (m.type === 'message' && String(m.conversationId) === String(id)) {
      setOtherTyping(false);
      fetchNew().catch(() => {});
    }
    if (m.type === 'reaction' && String(m.conversationId) === String(id)) {
      reloadAll().catch(() => {});
    }
    if (m.type === 'typing' && String(m.conversationId) === String(id) && m.userId === other.id) {
      setOtherTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setOtherTyping(false), 3500);
    }
  }), [fetchNew, reloadAll, id, other.id]);

  const toggleReaction = async (messageId, emoji) => {
    try {
      await api(`/messages/${id}/react`, { method: 'POST', body: { messageId, emoji } });
      await reloadAll();
    } catch (err) {
      toast.show(err.message);
    }
  };

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

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.show('Microphone not supported in this browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mr.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      mr.start(200);
      setRecording(true);
      setRecordSec(0);
      recordTimerRef.current = setInterval(() => {
        setRecordSec((s) => s + 1);
      }, 1000);
    } catch {
      toast.show('Microphone permission denied or unavailable.');
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    clearInterval(recordTimerRef.current);
    audioChunksRef.current = [];
    setRecording(false);
    setRecordSec(0);
  };

  const sendVoiceNote = () => {
    if (!mediaRecorderRef.current) return;
    const finalDuration = recordSec || 1;
    clearInterval(recordTimerRef.current);

    mediaRecorderRef.current.onstop = async () => {
      const mime = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const blob = new Blob(audioChunksRef.current, { type: mime });
      setRecording(false);
      setRecordSec(0);
      if (blob.size === 0) return;

      const fd = new FormData();
      fd.append('audio', blob, 'voicenote.webm');
      fd.append('duration', String(finalDuration));

      try {
        await api(`/messages/${id}/audio`, { method: 'POST', form: fd });
        await fetchNew();
      } catch (err) {
        toast.show(err.message);
      }
    };

    mediaRecorderRef.current.stop();
  };

  const formatRecordTime = (sec) => {
    const m = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
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
          <div
            key={m.id}
            className={`bubble-row${m.mine ? ' is-mine' : ''}`}
            onMouseEnter={() => setHoveredId(m.id)}
            onMouseLeave={() => setHoveredId((h) => (h === m.id ? null : h))}
          >
            <div className="bubble-container">
              <div className="bubble-actions-wrap">
                <div
                  className={`bubble${m.mine ? ' bubble--mine' : ''}${m.mediaType === 'audio' ? ' bubble--audio' : ''}${m.pending ? ' is-pending' : ''} fade-up`}
                  onClick={() => setHoveredId((h) => (h === m.id ? null : m.id))}
                >
                  {m.mediaType === 'audio' ? (
                    <AudioPlayer src={m.mediaUrl} duration={m.duration} mine={m.mine} />
                  ) : (
                    <div>{m.body}</div>
                  )}
                  {m.createdAt && (
                    <span className="bubble-time">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                {hoveredId === m.id && !m.pending && (
                  <div className="quick-reactions fade-up">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="quick-reaction-btn"
                        onClick={() => toggleReaction(m.id, emoji)}
                        title={`React with ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {m.reactions && m.reactions.length > 0 && (
                <div className="bubble-reactions">
                  {m.reactions.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      className={`bubble-reaction${r.reacted ? ' is-active' : ''}`}
                      onClick={() => toggleReaction(m.id, r.emoji)}
                      title={`${r.count} ${r.emoji}`}
                    >
                      <span>{r.emoji}</span>
                      {r.count > 1 && <span className="bubble-reaction__count">{r.count}</span>}
                    </button>
                  ))}
                </div>
              )}
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

      {recording ? (
        <div className="thread__composer thread__composer--recording">
          <div className="recording-indicator">
            <span className="recording-dot" />
            <span className="small strong">{formatRecordTime(recordSec)}</span>
            <span className="muted small">Recording voice note…</span>
          </div>
          <button
            type="button"
            className="btn btn--icon btn--sm"
            onClick={cancelRecording}
            title="Cancel recording"
            aria-label="Cancel recording"
          >
            <Trash2 size={18} />
          </button>
          <button
            type="button"
            className="btn btn--primary btn--icon btn--sm"
            onClick={sendVoiceNote}
            title="Send voice note"
            aria-label="Send voice note"
          >
            <Send size={18} />
          </button>
        </div>
      ) : (
        <form className="thread__composer" onSubmit={send}>
          <label className="sr-only" htmlFor="message-input">Message</label>
          <input
            id="message-input"
            className="input"
            value={text}
            maxLength={1000}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message…"
          />
          {text.trim() ? (
            <button className="btn btn--primary btn--icon" type="submit" aria-label="Send message">
              <Send size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--icon"
              onClick={startRecording}
              aria-label="Record voice note"
              title="Record voice note"
            >
              <Mic size={18} />
            </button>
          )}
        </form>
      )}
    </div>
  );
}
