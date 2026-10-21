// Create: choose a photo, video, or multi-photo carousel (2-10 photos),
// add a caption, optional poll, and audience, then upload with live progress.
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, X, BarChart2, Plus, ChevronLeft, ChevronRight, Images } from 'lucide-react';
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
  const addInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  // Poll state
  const [hasPoll, setHasPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);

  const addOption = () => {
    if (pollOptions.length < 4) setPollOptions([...pollOptions, '']);
  };
  const removeOption = (idx) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== idx));
    }
  };
  const updateOption = (idx, val) => {
    const next = [...pollOptions];
    next[idx] = val;
    setPollOptions(next);
  };

  useEffect(() => {
    if (!files.length) {
      setPreviews([]);
      setActiveIdx(0);
      return undefined;
    }
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    if (activeIdx >= urls.length) setActiveIdx(Math.max(0, urls.length - 1));
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  const handleFileSelection = (selectedList) => {
    setError('');
    if (!selectedList || !selectedList.length) return;
    const incoming = Array.from(selectedList);

    const hasVideo = incoming.some((f) => f.type.startsWith('video/'));
    if (hasVideo) {
      if (incoming.length > 1 || files.length > 0) {
        return setError('Videos cannot be combined with other photos or videos.');
      }
      const v = incoming[0];
      if (v.size > 100 * 1024 * 1024) return setError('Videos must be 100 MB or smaller.');
      setFiles([v]);
      return;
    }

    // All incoming are photos
    for (const f of incoming) {
      if (!f.type.startsWith('image/')) {
        return setError('Unsupported file type. Use JPG, PNG, WebP, GIF, or a video.');
      }
      if (f.size > 20 * 1024 * 1024) {
        return setError('Photos must be 20 MB or smaller.');
      }
    }

    // If current files already contain a video, replace with new photos
    const currentPhotos = files[0]?.type.startsWith('video/') ? [] : files;
    const combined = [...currentPhotos, ...incoming];
    if (combined.length > 10) {
      setError('You can select up to 10 photos per post.');
      setFiles(combined.slice(0, 10));
    } else {
      setFiles(combined);
    }
  };

  const removeFile = (idx) => {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    if (activeIdx >= next.length) setActiveIdx(Math.max(0, next.length - 1));
  };

  const clearAllFiles = () => {
    setFiles([]);
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!files.length || busy) return;
    setBusy(true);
    setError('');
    setProgress(0);
    const form = new FormData();
    files.forEach((f) => form.append('media', f));
    form.append('caption', caption);
    form.append('visibility', visibility);
    if (hasPoll && pollQuestion.trim()) {
      const validOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
      if (validOptions.length >= 2) {
        form.append('poll', JSON.stringify({ question: pollQuestion.trim(), options: validOptions }));
      }
    }
    try {
      const res = await uploadPost(form, setProgress);
      toast.show('Uploaded. We’re processing your post.');
      navigate(`/p/${res.post.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const isVideo = files.length === 1 && files[0].type.startsWith('video/');
  const isCarousel = files.length > 1;

  return (
    <div className="create fade-up">
      <h1 className="page-title">Create</h1>

      <form onSubmit={submit} className="create__grid">
        <div className="card create__media">
          {previews.length > 0 ? (
            <div className="create__preview-container">
              <div className="create__preview">
                {isVideo ? (
                  <video src={previews[0]} controls playsInline muted />
                ) : (
                  <img src={previews[activeIdx]} alt={`Upload preview ${activeIdx + 1}`} />
                )}

                <button
                  type="button"
                  className="icon-btn create__clear"
                  onClick={clearAllFiles}
                  aria-label="Remove all files"
                  title="Remove all"
                >
                  <X size={18} />
                </button>

                {isCarousel && (
                  <>
                    <span className="media__counter" aria-label={`Photo ${activeIdx + 1} of ${files.length}`}>
                      {activeIdx + 1}/{files.length}
                    </span>

                    {activeIdx > 0 && (
                      <button
                        type="button"
                        className="media__nav-btn media__nav-btn--prev"
                        onClick={() => setActiveIdx((i) => i - 1)}
                        aria-label="Previous photo"
                      >
                        <ChevronLeft size={20} />
                      </button>
                    )}

                    {activeIdx < files.length - 1 && (
                      <button
                        type="button"
                        className="media__nav-btn media__nav-btn--next"
                        onClick={() => setActiveIdx((i) => i + 1)}
                        aria-label="Next photo"
                      >
                        <ChevronRight size={20} />
                      </button>
                    )}
                  </>
                )}
              </div>

              {!isVideo && (
                <div className="create__strip" aria-label="Photo carousel manager">
                  {files.map((_, i) => (
                    <div
                      key={i}
                      className={`create__thumb${i === activeIdx ? ' is-active' : ''}`}
                      onClick={() => setActiveIdx(i)}
                    >
                      <img src={previews[i]} alt={`Thumbnail ${i + 1}`} />
                      <button
                        type="button"
                        className="create__thumb-del"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        aria-label={`Remove photo ${i + 1}`}
                        title="Remove photo"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}

                  {files.length < 10 && (
                    <label className="create__thumb create__thumb-add" title="Add another photo">
                      <input
                        ref={addInputRef}
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={(e) => handleFileSelection(e.target.files)}
                        className="sr-only"
                      />
                      <Plus size={18} />
                      <span>Add</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          ) : (
            <label
              className={`dropzone${dragging ? ' is-drag' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); handleFileSelection(e.dataTransfer.files); }}
            >
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={(e) => handleFileSelection(e.target.files)}
                className="sr-only"
              />
              <span className="dropzone__icon"><UploadCloud size={30} /></span>
              <strong>Drop photos or a video here</strong>
              <span className="muted small">
                Choose 1–10 photos for a carousel or 1 video · photos up to 20 MB · videos up to 3 minutes
              </span>
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <div className="card create__details">
          <div className="create__author">
            <span className="strong">@{user?.username}</span>
            {isCarousel && (
              <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Images size={13} /> {files.length} Photos (Carousel)
              </span>
            )}
          </div>
          <label className="field">
            <span>Caption</span>
            <textarea
              className="input textarea"
              rows={5}
              value={caption}
              maxLength={MAX_CAPTION}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption. Add #tags to help people find it."
            />
            <small className="muted small" aria-live="polite">{caption.length}/{MAX_CAPTION}</small>
          </label>

          <div className="field">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="strong" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart2 size={16} /> Poll
              </span>
              <button
                type="button"
                className={`btn btn--sm${hasPoll ? ' btn--primary' : ''}`}
                onClick={() => setHasPoll((v) => !v)}
              >
                {hasPoll ? 'Remove Poll' : '+ Add Poll'}
              </button>
            </div>
            {hasPoll && (
              <div className="stack-sm poll-builder fade-up" style={{ marginTop: 10 }}>
                <input
                  className="input"
                  value={pollQuestion}
                  maxLength={200}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="Ask a question…"
                />
                <div className="stack-sm" style={{ gap: 6 }}>
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="row" style={{ gap: 6 }}>
                      <input
                        className="input input--sm"
                        value={opt}
                        maxLength={100}
                        onChange={(e) => updateOption(i, e.target.value)}
                        placeholder={`Option ${i + 1}`}
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => removeOption(i)}
                          aria-label="Remove option"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {pollOptions.length < 4 && (
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={addOption}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    <Plus size={14} /> Add option
                  </button>
                )}
              </div>
            )}
          </div>

          <fieldset className="field">
            <legend>Who can see this</legend>
            <div className="radio-cards">
              {VISIBILITY.map((v) => (
                <label key={v.id} className={`radio-card${visibility === v.id ? ' is-on' : ''}`}>
                  <input
                    type="radio"
                    name="visibility"
                    value={v.id}
                    checked={visibility === v.id}
                    onChange={() => setVisibility(v.id)}
                  />
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

          <button className="btn btn--primary btn--block" disabled={!files.length || busy}>
            {busy ? `Uploading… ${Math.round(progress * 100)}%` : isCarousel ? `Share ${files.length} Photos` : 'Share'}
          </button>
        </div>
      </form>
    </div>
  );
}
