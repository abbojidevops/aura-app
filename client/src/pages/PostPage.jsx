// Single post view with comments. While a post is processing, it polls until the media is ready.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PostCard from '../components/PostCard.jsx';
import { CommentList, CommentComposer } from '../components/Comments.jsx';
import { ErrorState, Spinner } from '../components/Feedback.jsx';
import { api } from '../lib/api';

export default function PostPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');
  const [commentsKey, setCommentsKey] = useState(0);

  const load = () => {
    setError('');
    api(`/posts/${id}`).then((d) => setPost(d.post)).catch((e) => setError(e.message));
  };
  useEffect(() => { setPost(null); load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while the media is still being processed.
  useEffect(() => {
    if (post?.status !== 'processing') return undefined;
    const t = setInterval(() => api(`/posts/${id}`).then((d) => setPost(d.post)).catch(() => {}), 2500);
    return () => clearInterval(t);
  }, [post?.status, id]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!post) return <div className="center-pad"><Spinner /></div>;

  return (
    <div className="post-page fade-up">
      <PostCard
        post={post}
        patch={(changes) => setPost((p) => ({ ...p, ...changes }))}
        onDeleted={() => navigate('/', { replace: true })}
      />
      <section className="card comments-card" aria-label="Comments">
        <h2 className="section-title">Comments</h2>
        <CommentList key={commentsKey} postId={post.id} />
        <CommentComposer postId={post.id} onPosted={() => {
          setPost((p) => ({ ...p, commentCount: p.commentCount + 1 }));
          setCommentsKey((k) => k + 1);
        }} />
      </section>
    </div>
  );
}
