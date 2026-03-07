import { type ReactNode } from 'react';
import { AuthProvider } from '../hooks/useAuth';
import { SettingsProvider } from '../hooks/useSettings';
import { FeedProvider } from '../hooks/useFeeds';

/**
 * Full app wrapper for integration-style tests.
 * Requires fetch to be mocked globally (AuthProvider calls /api/auth/me on mount,
 * SettingsProvider calls getSetting via IndexedDB, FeedProvider calls getAllFeeds).
 */
export function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SettingsProvider>
        <FeedProvider>
          {children}
        </FeedProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}
