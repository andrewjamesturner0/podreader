export interface Feed {
  url: string;
  title: string;
  description: string;
  imageUrl: string;
  lastFetchedAt: number;
}

export interface Episode {
  guid: string;
  feedUrl: string;
  title: string;
  pubDate: string;
  duration: string;
  audioUrl: string;
  description: string;
}

export interface Transcript {
  episodeId: string;
  text: string;
  createdAt: number;
  model: string;
}

export interface Summary {
  episodeId: string;
  markdown: string;
  provider: string;
  model: string;
  createdAt: number;
}

export interface AppSettings {
  provider: 'openai' | 'anthropic' | 'ollama';
  transcriptionProvider: 'openai' | 'local';
  sidebarWidth: number;
  episodeHeight: number;
  feedSortOrder: 'alphabetical' | 'newest-first' | 'oldest-first';
}
