import { useState, useCallback, useEffect } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { FeedProvider } from './hooks/useFeeds';
import { SettingsProvider, useSettings } from './hooks/useSettings';
import FeedManager from './components/FeedManager';
import EpisodeList from './components/EpisodeList';
import SummaryView from './components/SummaryView';
import SettingsPanel from './components/SettingsPanel';
import ResizeHandle from './components/ResizeHandle';
import LoginPage from './components/LoginPage';

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 500;
const SIDEBAR_DEFAULT = 280;
const EPISODE_MIN = 100;
const EPISODE_DEFAULT = 300;

function AppLayout() {
  const [showSettings, setShowSettings] = useState(false);
  const { settings, updateSetting, loaded } = useSettings();
  const { user, logout } = useAuth();

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [episodeHeight, setEpisodeHeight] = useState(EPISODE_DEFAULT);

  // Load persisted panel sizes from settings
  useEffect(() => {
    if (!loaded) return;
    const savedSidebar = settings.sidebarWidth;
    const savedEpisode = settings.episodeHeight;
    if (typeof savedSidebar === 'number' && savedSidebar >= SIDEBAR_MIN && savedSidebar <= SIDEBAR_MAX) {
      setSidebarWidth(savedSidebar);
    }
    if (typeof savedEpisode === 'number' && savedEpisode >= EPISODE_MIN) {
      setEpisodeHeight(savedEpisode);
    }
  }, [loaded]);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth(prev => {
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, prev + delta));
      return next;
    });
  }, []);

  const handleEpisodeResize = useCallback((delta: number) => {
    setEpisodeHeight(prev => {
      const maxHeight = window.innerHeight * 0.7;
      const next = Math.min(maxHeight, Math.max(EPISODE_MIN, prev + delta));
      return next;
    });
  }, []);

  // Persist panel sizes on pointer up (debounced via effect)
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      updateSetting('sidebarWidth', sidebarWidth);
    }, 500);
    return () => clearTimeout(timer);
  }, [sidebarWidth, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      updateSetting('episodeHeight', episodeHeight);
    }, 500);
    return () => clearTimeout(timer);
  }, [episodeHeight, loaded]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>PodReader</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {user && <span style={{ fontSize: '0.85rem', color: '#888' }}>{user.username}</span>}
          <button
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
          >
            {showSettings ? 'Close Settings' : 'Settings'}
          </button>
          {user && (
            <button className="settings-btn" onClick={logout}>
              Logout
            </button>
          )}
        </div>
      </header>
      {showSettings && <SettingsPanel />}
      <div className="app-body">
        <aside className="sidebar" style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN }}>
          <FeedManager />
        </aside>
        <ResizeHandle direction="horizontal" onResize={handleSidebarResize} />
        <main className="main-pane">
          <div style={{ height: episodeHeight, minHeight: EPISODE_MIN, overflow: 'hidden', flexShrink: 0 }}>
            <EpisodeList />
          </div>
          <ResizeHandle direction="vertical" onResize={handleEpisodeResize} />
          <SummaryView />
        </main>
      </div>
    </div>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <LoginPage />;

  return (
    <SettingsProvider>
      <FeedProvider>
        <AppLayout />
      </FeedProvider>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
