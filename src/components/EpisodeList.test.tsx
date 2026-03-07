import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EpisodeList from './EpisodeList';

const mockSelectEpisode = vi.fn();

// Default mock state — no feed selected
let mockFeedState = {
  episodes: [] as any[],
  selectedFeedUrl: null as string | null,
  selectedEpisodeId: null as string | null,
  selectEpisode: mockSelectEpisode,
  feeds: [] as any[],
  episodeStatuses: {} as Record<string, string>,
};

vi.mock('../hooks/useFeeds', () => ({
  ALL_SUMMARIES_URL: '__all-summaries__',
  ALL_EPISODES_URL: '__all-episodes__',
  useFeeds: () => mockFeedState,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFeedState = {
    episodes: [],
    selectedFeedUrl: null,
    selectedEpisodeId: null,
    selectEpisode: mockSelectEpisode,
    feeds: [],
    episodeStatuses: {},
  };
});

describe('EpisodeList', () => {
  it('returns null when no feed is selected', () => {
    const { container } = render(<EpisodeList />);
    expect(container.innerHTML).toBe('');
  });

  it('renders episode cards for a selected feed', () => {
    mockFeedState.selectedFeedUrl = 'https://example.com/feed.xml';
    mockFeedState.feeds = [{ url: 'https://example.com/feed.xml', title: 'Test Podcast' }];
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'Episode One', pubDate: '2025-01-15', duration: '30:00', feedUrl: 'https://example.com/feed.xml' },
      { guid: 'ep2', title: 'Episode Two', pubDate: '2025-01-14', duration: '45:00', feedUrl: 'https://example.com/feed.xml' },
    ];
    mockFeedState.episodeStatuses = { ep1: 'summarised', ep2: 'none' };

    render(<EpisodeList />);

    expect(screen.getByText('Episodes \u2014 Test Podcast')).toBeInTheDocument();
    expect(screen.getByText('Episode One')).toBeInTheDocument();
    expect(screen.getByText('Episode Two')).toBeInTheDocument();
  });

  it('shows empty state message when feed has no episodes', () => {
    mockFeedState.selectedFeedUrl = 'https://example.com/feed.xml';
    mockFeedState.feeds = [{ url: 'https://example.com/feed.xml', title: 'Test Podcast' }];

    render(<EpisodeList />);

    expect(screen.getByText('No episodes found.')).toBeInTheDocument();
  });

  it('shows "All Summarised Episodes" heading for virtual summaries feed', () => {
    mockFeedState.selectedFeedUrl = '__all-summaries__';

    render(<EpisodeList />);

    expect(screen.getByText('All Summarised Episodes')).toBeInTheDocument();
    expect(screen.getByText('No summarised episodes yet. Summarise an episode to see it here.')).toBeInTheDocument();
  });

  it('shows "Most Recent Episodes" heading for virtual all-episodes feed', () => {
    mockFeedState.selectedFeedUrl = '__all-episodes__';

    render(<EpisodeList />);

    expect(screen.getByText('Most Recent Episodes')).toBeInTheDocument();
  });

  it('calls selectEpisode when an episode card is clicked', async () => {
    const user = userEvent.setup();
    mockFeedState.selectedFeedUrl = 'https://example.com/feed.xml';
    mockFeedState.feeds = [{ url: 'https://example.com/feed.xml', title: 'Test Podcast' }];
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'Episode One', pubDate: '2025-01-15', duration: '30:00', feedUrl: 'https://example.com/feed.xml' },
    ];
    mockFeedState.episodeStatuses = { ep1: 'none' };

    render(<EpisodeList />);

    await user.click(screen.getByText('Episode One'));
    expect(mockSelectEpisode).toHaveBeenCalledWith('ep1');
  });

  it('shows feed title on episode cards in all-summaries view', () => {
    mockFeedState.selectedFeedUrl = '__all-summaries__';
    mockFeedState.feeds = [{ url: 'https://example.com/feed.xml', title: 'My Podcast' }];
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'Episode One', pubDate: '2025-01-15', duration: '30:00', feedUrl: 'https://example.com/feed.xml' },
    ];
    mockFeedState.episodeStatuses = { ep1: 'summarised' };

    render(<EpisodeList />);

    // The feed title should appear in the episode meta
    expect(screen.getByText(/My Podcast/)).toBeInTheDocument();
  });
});
