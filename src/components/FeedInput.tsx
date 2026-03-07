import { useState, useRef } from 'react';
import { useFeeds } from '../hooks/useFeeds';
import { extractYouTubeVideoId } from '../utils/youtube';
import './FeedInput.css';

function parseOpml(xml: string): { url: string; title: string }[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const outlines = doc.querySelectorAll('outline[xmlUrl]');
  const feeds: { url: string; title: string }[] = [];
  outlines.forEach(el => {
    const url = el.getAttribute('xmlUrl');
    const title = el.getAttribute('text') || el.getAttribute('title') || '';
    if (url) feeds.push({ url, title });
  });
  return feeds;
}

export default function FeedInput() {
  const [url, setUrl] = useState('');
  const [importResult, setImportResult] = useState<string | null>(null);
  const { subscribe, addYouTubeVideo, importFeeds, importProgress, loading } = useFeeds();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    if (extractYouTubeVideoId(trimmed)) {
      await addYouTubeVideo(trimmed);
    } else {
      await subscribe(trimmed);
    }
    setUrl('');
  };

  const handleImportClick = () => {
    setImportResult(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const feeds = parseOpml(text);

    if (feeds.length === 0) {
      setImportResult('No feeds found in OPML file.');
      e.target.value = '';
      return;
    }

    try {
      const result = await importFeeds(feeds);
      const parts: string[] = [];
      if (result.succeeded > 0) parts.push(`${result.succeeded} imported`);
      if (result.skipped > 0) parts.push(`${result.skipped} already subscribed`);
      if (result.failed > 0) parts.push(`${result.failed} failed`);
      setImportResult(parts.join(', '));
    } catch (err) {
      setImportResult(`Import error: ${err instanceof Error ? err.message : 'unknown error'}`);
    }

    // Clear file input so the same file can be re-selected
    e.target.value = '';
  };

  const isImporting = importProgress !== null;

  return (
    <div className="feed-input">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Paste RSS feed or YouTube URL..."
          value={url}
          onChange={e => setUrl(e.target.value)}
          disabled={loading || isImporting}
        />
        <button type="submit" disabled={loading || isImporting || !url.trim()}>
          {loading ? 'Loading...' : 'Add'}
        </button>
        <button
          type="button"
          className="import-opml-btn"
          onClick={handleImportClick}
          disabled={loading || isImporting}
          title="Import feeds from an OPML file"
        >
          Import OPML
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".opml,.xml"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </form>
      {isImporting && (
        <div className="import-progress">
          <div className="import-progress-bar">
            <div
              className="import-progress-fill"
              style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
            />
          </div>
          <span className="import-progress-text">
            Importing {importProgress.current}/{importProgress.total}: {importProgress.currentFeed}
          </span>
        </div>
      )}
      {importResult && !isImporting && (
        <div className="import-result">{importResult}</div>
      )}
    </div>
  );
}
