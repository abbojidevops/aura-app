// Shared post actions. Updates are optimistic: the UI changes instantly and reverts if the server rejects it.
import { api } from './api';

export async function toggleLike(post, patch, toast) {
  const liked = !post.liked;
  patch({ liked, likeCount: Math.max(0, post.likeCount + (liked ? 1 : -1)) });
  try {
    const res = await api(`/posts/${post.id}/like`, { method: liked ? 'POST' : 'DELETE' });
    patch({ liked: res.liked, likeCount: res.likeCount });
  } catch (err) {
    patch({ liked: post.liked, likeCount: post.likeCount });
    toast.show(err.message);
  }
}

export async function toggleSave(post, patch, toast) {
  const saved = !post.saved;
  patch({ saved });
  try {
    await api(`/posts/${post.id}/save`, { method: saved ? 'POST' : 'DELETE' });
    toast.show(saved ? 'Saved to your collection' : 'Removed from saved');
  } catch (err) {
    patch({ saved: post.saved });
    toast.show(err.message);
  }
}

export async function sharePost(post, toast) {
  const url = `${window.location.origin}/p/${post.id}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: `@${post.author.username} on AURA`, url });
      return;
    } catch { /* user cancelled or unsupported; fall through to copy */ }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.show('Link copied to clipboard');
  } catch {
    toast.show(url);
  }
}
