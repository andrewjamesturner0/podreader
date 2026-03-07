import { useMemo } from 'react';
import { useFeeds, ALL_SUMMARIES_URL, ALL_EPISODES_URL, YOUTUBE_FEED_URL } from '../hooks/useFeeds';
import { useSettings } from '../hooks/useSettings';
import FeedInput from './FeedInput';
import './FeedManager.css';

export default function FeedManager() {
  const { feeds, selectedFeedUrl, selectFeed, unsubscribe, refreshAllFeeds, loading, error, feedErrors } = useFeeds();
  const { settings, updateSetting } = useSettings();

  const hasYouTubeFeed = feeds.some(f => f.url === YOUTUBE_FEED_URL);

  const sortedFeeds = useMemo(() => {
    const sorted = feeds.filter(f => f.url !== YOUTUBE_FEED_URL);
    switch (settings.feedSortOrder) {
      case 'alphabetical':
        sorted.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
        break;
      case 'newest-first':
        sorted.sort((a, b) => (b.lastFetchedAt || 0) - (a.lastFetchedAt || 0));
        break;
      case 'oldest-first':
        sorted.sort((a, b) => (a.lastFetchedAt || 0) - (b.lastFetchedAt || 0));
        break;
    }
    return sorted;
  }, [feeds, settings.feedSortOrder]);

  return (
    <>
      <div className="sidebar-header">
        Feeds
        {feeds.length > 0 && (
          <button
            className="refresh-feed-btn"
            onClick={refreshAllFeeds}
            disabled={loading}
            title="Refresh all feeds"
          >
            {loading ? 'refreshing...' : 'refresh'}
          </button>
        )}
        <div className="feed-sort-buttons">
          <button
            className={`feed-sort-btn ${settings.feedSortOrder === 'alphabetical' ? 'active' : ''}`}
            onClick={() => updateSetting('feedSortOrder', 'alphabetical')}
            title="Sort alphabetically"
          >A-Z</button>
          <button
            className={`feed-sort-btn ${settings.feedSortOrder === 'newest-first' ? 'active' : ''}`}
            onClick={() => updateSetting('feedSortOrder', 'newest-first')}
            title="Sort by newest"
          >New</button>
          <button
            className={`feed-sort-btn ${settings.feedSortOrder === 'oldest-first' ? 'active' : ''}`}
            onClick={() => updateSetting('feedSortOrder', 'oldest-first')}
            title="Sort by oldest"
          >Old</button>
        </div>
      </div>
      <FeedInput />
      {error && <div className="error-msg">{error}</div>}
      <div className="feed-list">
        <div
          className={`feed-item virtual-feed-item ${selectedFeedUrl === ALL_EPISODES_URL ? 'selected' : ''}`}
          onClick={() => selectFeed(ALL_EPISODES_URL)}
        >
          <div className="virtual-feed-icon">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" fill="#89bbfe" />
              <path d="M8 4v4l2.5 2.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="8" cy="8" r="3.5" stroke="#fff" strokeWidth="1.2" fill="none" />
            </svg>
          </div>
          <div className="feed-item-info">
            <h3>Most Recent</h3>
            <p>All episodes, newest first</p>
          </div>
        </div>
        <div
          className={`feed-item virtual-feed-item ${selectedFeedUrl === ALL_SUMMARIES_URL ? 'selected' : ''}`}
          onClick={() => selectFeed(ALL_SUMMARIES_URL)}
        >
          <div className="virtual-feed-icon">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" fill="#89bbfe" />
              <path d="M4.5 8.5L7 11L11.5 5.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="feed-item-info">
            <h3>All Summarised</h3>
            <p>Episodes with summaries</p>
          </div>
        </div>
        {hasYouTubeFeed && (
          <div
            className={`feed-item virtual-feed-item ${selectedFeedUrl === YOUTUBE_FEED_URL ? 'selected' : ''}`}
            onClick={() => selectFeed(YOUTUBE_FEED_URL)}
          >
            <div className="virtual-feed-icon">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" fill="#FF0000" />
                <path d="M6.5 5L11.5 8L6.5 11V5Z" fill="#fff" />
              </svg>
            </div>
            <div className="feed-item-info">
              <h3>YouTube</h3>
              <p>YouTube videos</p>
            </div>
          </div>
        )}
        {sortedFeeds.length > 0 && <hr className="feed-list-divider" />}
        {sortedFeeds.map(feed => (
          <div
            key={feed.url}
            className={`feed-item ${selectedFeedUrl === feed.url ? 'selected' : ''}`}
            onClick={() => selectFeed(feed.url)}
          >
            {feed.imageUrl && (feed.imageUrl.startsWith('http://') || feed.imageUrl.startsWith('https://')) && <img src={feed.imageUrl} alt="" />}
            <div className="feed-item-info">
              <h3>{feed.title}</h3>
              <p>{feed.description?.slice(0, 60)}</p>
            </div>
            {feedErrors[feed.url] && (
              <span className="feed-error-indicator" title={feedErrors[feed.url]}>!</span>
            )}
            <button
              className="remove-btn"
              title="Unsubscribe"
              onClick={e => {
                e.stopPropagation();
                unsubscribe(feed.url);
              }}
            >
              &times;
            </button>
          </div>
        ))}
        {sortedFeeds.length === 0 && (
          <div style={{ padding: '12px 20px', color: '#999', fontSize: '0.85rem' }}>
            No feeds yet. Subscribe to a podcast RSS feed above.
          </div>
        )}
      </div>
    </>
  );
}
