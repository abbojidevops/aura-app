import { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import Avatar from './Avatar.jsx';
import StoryViewer from './StoryViewer.jsx';
import CreateStoryModal from './CreateStoryModal.jsx';
import { api } from '../lib/api';
import { useAuth } from '../lib/context.jsx';

export default function StoryTray() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [activeViewerIdx, setActiveViewerIdx] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchFeed = useCallback(async () => {
    try {
      const data = await api('/stories/feed');
      setGroups(data.groups || []);
    } catch {
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const myGroup = groups.find((g) => g.author.isMe);
  const otherGroups = groups.filter((g) => !g.author.isMe);

  const handleMyStoryClick = () => {
    if (myGroup && myGroup.stories.length > 0) {
      const idx = groups.findIndex((g) => g.author.isMe);
      setActiveViewerIdx(idx >= 0 ? idx : 0);
    } else {
      setCreateOpen(true);
    }
  };

  const handleGroupClick = (group) => {
    const idx = groups.findIndex((g) => g.author.id === group.author.id);
    setActiveViewerIdx(idx >= 0 ? idx : 0);
  };

  return (
    <>
      <div className="story-tray" role="region" aria-label="Stories">
        {/* Current user's story */}
        <button
          type="button"
          className="story-item"
          onClick={handleMyStoryClick}
          aria-label={myGroup ? 'View your story' : 'Add to your story'}
        >
          <div className={`story-ring ${myGroup ? (myGroup.hasUnseen ? 'story-ring--unseen' : 'story-ring--seen') : 'story-ring--add'}`}>
            <Avatar user={user} size={54} />
            <span
              className="story-add-badge"
              role="button"
              tabIndex={0}
              aria-label="Add story"
              onClick={(e) => {
                e.stopPropagation();
                setCreateOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  setCreateOpen(true);
                }
              }}
            >
              <Plus size={14} strokeWidth={3} />
            </span>
          </div>
          <span className="story-name truncate">Your story</span>
        </button>

        {/* Other users' stories */}
        {otherGroups.map((group) => (
          <button
            key={group.author.id}
            type="button"
            className="story-item"
            onClick={() => handleGroupClick(group)}
            aria-label={`${group.author.displayName}'s story`}
          >
            <div className={`story-ring ${group.hasUnseen ? 'story-ring--unseen' : 'story-ring--seen'}`}>
              <Avatar user={group.author} size={54} />
            </div>
            <span className="story-name truncate">{group.author.displayName}</span>
          </button>
        ))}
      </div>

      {createOpen && (
        <CreateStoryModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={fetchFeed}
        />
      )}

      {activeViewerIdx !== null && groups[activeViewerIdx] && (
        <StoryViewer
          groups={groups}
          initialGroupIndex={activeViewerIdx}
          onClose={() => {
            setActiveViewerIdx(null);
            fetchFeed();
          }}
          onStoryDeleted={() => {
            fetchFeed();
          }}
        />
      )}
    </>
  );
}
