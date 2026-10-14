// Paginated feed loader with optimistic patching. Used by Home (For you / Following) and Reels.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export function useFeed(mode) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const hasMoreRef = useRef(true);
  const nextOffset = useRef(0);
  const inFlight = useRef(false);

  const fetchPage = useCallback(async (reset) => {
    if (inFlight.current) return;
    if (!reset && !hasMoreRef.current) return;
    inFlight.current = true;
    setLoading(true);
    setError('');
    const offset = reset ? 0 : nextOffset.current;
    try {
      const data = await api(`/feed?mode=${mode}&offset=${offset}`);
      setItems((prev) => (reset ? data.items : [...(prev || []), ...data.items]));
      nextOffset.current = data.nextOffset ?? 0;
      hasMoreRef.current = data.nextOffset !== null;
      setHasMore(hasMoreRef.current);
    } catch (err) {
      setError(err.message);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    nextOffset.current = 0;
    hasMoreRef.current = true;
    setHasMore(true);
    setItems(null);
    fetchPage(true);
  }, [fetchPage]);

  const loadMore = useCallback(() => fetchPage(false), [fetchPage]);
  const reload = useCallback(() => fetchPage(true), [fetchPage]);
  const patch = useCallback((id, changes) => setItems((list) => list?.map((x) => (x.id === id ? { ...x, ...changes } : x))), []);
  const remove = useCallback((id) => setItems((list) => list?.filter((x) => x.id !== id)), []);

  return { items, error, loading, hasMore, loadMore, reload, patch, remove };
}
