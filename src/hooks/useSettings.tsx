import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getSetting, setSetting } from '../services/dataApi';
import type { AppSettings } from '../types';

interface SettingsContextValue {
  settings: AppSettings;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  loaded: boolean;
}

// Fix #3: Removed API key fields — keys are now server-side only
const defaultSettings: AppSettings = {
  provider: 'openai',
  transcriptionProvider: 'openai',
  sidebarWidth: 280,
  episodeHeight: 300,
  feedSortOrder: 'alphabetical',
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: defaultSettings,
  updateSetting: async () => {},
  loaded: false,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const provider = ((await getSetting('provider')) as AppSettings['provider']) || 'openai';
      const transcriptionProvider = ((await getSetting('transcriptionProvider')) as AppSettings['transcriptionProvider']) || 'openai';
      const sidebarWidthStr = await getSetting('sidebarWidth');
      const episodeHeightStr = await getSetting('episodeHeight');
      const sidebarWidth = sidebarWidthStr ? Number(sidebarWidthStr) : 280;
      const episodeHeight = episodeHeightStr ? Number(episodeHeightStr) : 300;
      const feedSortOrder = ((await getSetting('feedSortOrder')) as AppSettings['feedSortOrder']) || 'alphabetical';
      setSettings({ provider, transcriptionProvider, sidebarWidth, episodeHeight, feedSortOrder });
      setLoaded(true);
    })();
  }, []);

  const updateSetting = useCallback(async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    await setSetting(key, String(value));
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSetting, loaded }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
