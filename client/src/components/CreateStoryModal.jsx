import { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import Sheet from './Sheet.jsx';
import { getToken } from '../lib/api';
import { useToast } from '../lib/context.jsx';

export default function CreateStoryModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCaption('');
    setUploading(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const onFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    const form = new FormData();
    form.append('media', file);
    if (caption.trim()) form.append('caption', caption.trim());

    try {
      const token = getToken();
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to post story');
      toast.show('Added to your story!');
      reset();
      onCreated?.();
      onClose();
    } catch (err) {
      toast.show(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title="Add to story">
      <form className="stack" onSubmit={submit}>
        {!preview ? (
          <div
            className="card"
            style={{
              padding: '36px 16px',
              textAlign: 'center',
              border: '2px dashed var(--border)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}
            onClick={() => fileInput.current?.click()}
          >
            <Camera size={36} className="muted" />
            <p className="strong">Choose a photo or video</p>
            <p className="muted small">Disappears automatically after 24 hours</p>
            <input
              type="file"
              ref={fileInput}
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={onFileSelect}
            />
          </div>
        ) : (
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000', maxHeight: 360 }}>
            {file?.type.startsWith('video/') ? (
              <video src={preview} controls style={{ width: '100%', maxHeight: 360, objectFit: 'contain' }} />
            ) : (
              <img src={preview} alt="Preview" style={{ width: '100%', maxHeight: 360, objectFit: 'contain' }} />
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={reset}
              style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff' }}
              aria-label="Remove media"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <input
          type="text"
          className="input"
          placeholder="Add a caption… (optional)"
          maxLength={500}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn--sm" onClick={close}>Cancel</button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={!file || uploading}>
            {uploading ? 'Sharing…' : 'Share story'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
