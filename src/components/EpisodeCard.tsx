import { useFeeds } from '../hooks/useFeeds';

interface Props {
  guid: string;
  title: string;
  pubDate: string;
  duration: string;
  feedTitle?: string;
  selected: boolean;
  onClick: () => void;
}

function SummaryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="summary-icon">
      <circle cx="8" cy="8" r="7" fill="#89bbfe" />
      <path d="M4.5 8.5L7 11L11.5 5.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TranscribedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="summary-icon">
      <circle cx="8" cy="8" r="7" fill="#6f8ab7" />
      <path d="M5 8H11M8 5V11" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function EpisodeCard({ guid, title, pubDate, duration, feedTitle, selected, onClick }: Props) {
  const { episodeStatuses } = useFeeds();
  const status = episodeStatuses[guid] || 'none';

  const dateStr = pubDate ? new Date(pubDate).toLocaleDateString() : '';

  return (
    <div className={`episode-card ${selected ? 'selected' : ''}`} onClick={onClick}>
      <div className="episode-status-icon">
        {status === 'summarised' && <SummaryIcon />}
        {status === 'transcribed' && <TranscribedIcon />}
        {status === 'none' && <div className="status-dot-empty" />}
      </div>
      <div className="episode-info">
        <h3>{title}</h3>
        <span className="episode-meta">
          {feedTitle ? `${feedTitle} · ` : ''}{dateStr}
          {duration ? ` · ${duration}` : ''}
        </span>
      </div>
      <span className={`episode-status ${status}`}>
        {status === 'summarised' ? 'Summarised' : status === 'transcribed' ? 'Transcribed' : ''}
      </span>
    </div>
  );
}
