// "Tune your feed": the sliders are the real ranking weights. Each change is saved and the feed reorders.
import { useEffect, useRef, useState } from 'react';
import Sheet from './Sheet.jsx';
import { api } from '../lib/api';
import { useToast } from '../lib/context.jsx';

const SLIDERS = [
  { key: 'friends', label: 'People you follow', hint: 'How strongly posts from creators you follow rise.' },
  { key: 'newCreators', label: 'Small creators', hint: 'A lift for accounts with fewer than 20 followers.' },
  { key: 'controversial', label: 'Reported posts', hint: 'How far posts that others reported sink.' },
];

export default function TuneFeed({ open, onClose, settings, onSaved }) {
  const toast = useToast();
  const [local, setLocal] = useState(settings);
  const timer = useRef(null);

  useEffect(() => { if (settings) setLocal(settings); }, [settings]);

  const save = (next) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await api('/me/feed-settings', { method: 'PATCH', body: next });
        onSaved(res.settings);
      } catch (err) {
        toast.show(err.message);
      }
    }, 300);
  };

  const update = (key, value) => {
    const next = { ...local, [key]: Number(value) };
    setLocal(next);
    save(next);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Tune your feed">
      {local && (
        <div className="tune">
          <p className="muted small">These sliders are the ranking weights. Nothing is hidden from you, and every post shows why it appears.</p>
          {SLIDERS.map((s) => (
            <label key={s.key} className="tune__row">
              <span className="tune__head">
                <span className="strong">{s.label}</span>
                <span className="tune__value">{local[s.key]}%</span>
              </span>
              <input type="range" min="0" max="100" step="5" value={local[s.key]} onChange={(e) => update(s.key, e.target.value)} aria-describedby={`${s.key}-hint`} />
              <span id={`${s.key}-hint`} className="muted small">{s.hint}</span>
            </label>
          ))}
        </div>
      )}
    </Sheet>
  );
}
