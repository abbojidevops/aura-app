// Create: choose a photo or video, add a caption and audience, then upload with live progress.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, X } from 'lucide-react';
import { uploadPost } from '../lib/api';
import { useToast, useAuth } from '../lib/context.jsx';

const MAX_CAPTION = 2200;
const VISIBILITY = [
  { id: 'public', label: 'Public', hint: 'Anyone can see this' },
  { id: 'followers', label: 'Followers', hint: 'Only people who follow you' },
  { id: 'private', label: 'Only me', hint: 'Saved privately to your profile' },
];

export default function Create() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f) => {
    setError('');
    if (!f) return;
    const isVideo = f.type.startsWith('video/');
    const isImage = f.type.startsWith('image/');
    if (!isVideo && !isImage) return setError('That file type isn’t supported. Use a photo or a short video.');
    if (isImage && f.size > 20 * 1024 * 1024) return setError('Photos must be 20 MB or smaller.');
    if (isVideo && f.size > 100 * 1024 * 1024) return setError('Videos must be 100 MB or smaller.');
    setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setError('');
    setProgress(0);
    const form = new FormData();
    form.append('media', file);
    form.append('caption', caption);
    form.append('visibility', visibility);
    try {
      const res = await uploadPost(form, setProgress);
      toast.show('Uploaded. We’re processing your post.');
      navigate(`/p/${res.post.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="create fade-up">
      <h1 className="page-title">Create</h1>

      <form onSubmit={submit} className="create__grid">
        <div className="card create__media">
          {preview ? (
            <div className="create__preview">
              {file.type.startsWith('video/') ? (
                <video src={preview} controls playsInline muted />
              ) : (
                <img src={preview} alt="Selected upload preview" />
              )}
              <button type="button" className="icon-btn create__clear" onClick={() => setFile(null)} aria-label="Remove selected file">
                <X size={18} />
              </button>
            </div>
          ) : (
            <label
              className={`dropzone${dragging ? ' is-drag' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}
            >
              <input type="file" accept="image/*,video/*" onChange={(e) => pick(e.target.files[0])} className="sr-only" />
              <span className="dropzone__icon"><UploadCloud size={30} /></span>
              <strong>Drop a photo or video here</strong>
              <span className="muted small">or click to choose a file · photos up to 20 MB · videos up to 3 minutes</span>
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <div className="card create__details">
          <div className="create__author">
            <span className="strong">@{user?.username}</span>
          </div>
          <label className="field">
            <span>Caption</span>
            <textarea className="input textarea" rows={5} value={caption} maxLength={MAX_CAPTION} onChange={(e) => setCaption(e.target.value)} placeholder="Write a caption. Add #tags to help people find it." />
            <small className="muted small" aria-live="polite">{caption.length}/{MAX_CAPTION}</small>
          </label>

          <fieldset className="field">
            <legend>Who can see this</legend>
            <div className="radio-cards">
              {VISIBILITY.map((v) => (
                <label key={v.id} className={`radio-card${visibility === v.id ? ' is-on' : ''}`}>
                  <input type="radio" name="visibility" value={v.id} checked={visibility === v.id} onChange={() => setVisibility(v.id)} />
                  <span className="strong">{v.label}</span>
                  <span className="muted small">{v.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {busy && (
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}

          <button className="btn btn--primary btn--block" disabled={!file || busy}>
            {busy ? `Uploading… ${Math.round(progress * 100)}%` : 'Share'}
          </button>
        </div>
      </form>
    </div>
  );
}
