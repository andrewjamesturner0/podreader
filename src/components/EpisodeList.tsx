import { useState, useEffect } from 'react';
import { useFeeds, ALL_SUMMARIES_URL, ALL_EPISODES_URL } from '../hooks/useFeeds';
import EpisodeCard from './EpisodeCard';
import './EpisodeList.css';

export default function EpisodeList() {
  const { episodes, selectedFeedUrl, selectedEpisodeId, selectEpisode, feeds } = useFeeds();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Reset page when feed or search changes
  useEffect(() => {
    setPage(1);
  }, [selectedFeedUrl, searchQuery]);

  // Reset search when feed changes
  useEffect(() => {
    setSearchQuery('');
  }, [selectedFeedUrl]);

  if (!selectedFeedUrl) return null;

  const isAllSummaries = selectedFeedUrl === ALL_SUMMARIES_URL;
  const isAllEpisodes = selectedFeedUrl === ALL_EPISODES_URL;
  const feed = (isAllSummaries || isAllEpisodes) ? null : feeds.find(f => f.url === selectedFeedUrl);
  const heading = isAllSummaries
    ? 'All Summarised Episodes'
    : isAllEpisodes
    ? 'Most Recent Episodes'
    : `Episodes \u2014 ${feed?.title || 'Untitled'}`;
  const emptyMessage = isAllSummaries
    ? 'No summarised episodes yet. Summarise an episode to see it here.'
    : isAllEpisodes
    ? 'No episodes yet. Subscribe to a feed and refresh to see episodes here.'
    : 'No episodes found.';

  // Sort newest-first (handles both ISO and RFC 2822 date strings)
  const sorted = [...episodes].sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  const filtered = searchQuery
    ? sorted.filter(ep => ep.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : sorted;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="episode-list">
      <h2>{heading}</h2>
      {episodes.length > 0 && (
        <div className="episode-search">
          <input
            type="text"
            placeholder="Search episodes..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="episode-search-input"
          />
        </div>
      )}
      {paged.map(ep => (
        <EpisodeCard
          key={ep.guid}
          guid={ep.guid}
          title={ep.title}
          pubDate={ep.pubDate}
          duration={ep.duration}
          feedTitle={isAllSummaries || isAllEpisodes ? feeds.find(f => f.url === ep.feedUrl)?.title : undefined}
          selected={selectedEpisodeId === ep.guid}
          onClick={() => selectEpisode(ep.guid)}
        />
      ))}
      {filtered.length === 0 && episodes.length > 0 && (
        <div className="episode-empty">No episodes match your search.</div>
      )}
      {episodes.length === 0 && (
        <div className="episode-empty">{emptyMessage}</div>
      )}
      {totalPages > 1 && (
        <div className="episode-pagination">
          <button onClick={() => setPage(p => p - 1)} disabled={page <= 1}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>Next</button>
        </div>
      )}
    </div>
  );
}
