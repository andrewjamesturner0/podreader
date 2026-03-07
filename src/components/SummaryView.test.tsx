import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SummaryView from './SummaryView';

const mockRunPipeline = vi.fn();
const mockRunTranscription = vi.fn();
const mockRunSummarisation = vi.fn();
const mockLoadCached = vi.fn();
const mockRefreshStatuses = vi.fn();

let mockFeedState: any;
let mockSummaryState: any;

vi.mock('../hooks/useFeeds', () => ({
  useFeeds: () => mockFeedState,
}));

vi.mock('../hooks/useSummary', () => ({
  useSummary: () => mockSummaryState,
}));

// Mock ReactMarkdown to avoid complex rendering
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockFeedState = {
    selectedEpisodeId: null,
    episodes: [],
    refreshStatuses: mockRefreshStatuses,
  };
  mockSummaryState = {
    stage: 'idle',
    error: null,
    transcript: null,
    summary: null,
    loadCached: mockLoadCached,
    runPipeline: mockRunPipeline,
    runTranscription: mockRunTranscription,
    runSummarisation: mockRunSummarisation,
  };
});

describe('SummaryView', () => {
  it('shows placeholder when no episode is selected', () => {
    render(<SummaryView />);
    expect(screen.getByText('Select an episode to view or generate a summary.')).toBeInTheDocument();
  });

  it('shows episode title when an episode is selected', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Great Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];

    render(<SummaryView />);
    expect(screen.getByText('My Great Episode')).toBeInTheDocument();
  });

  it('shows "Transcribe & Summarise" button when no transcript or summary exists', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];

    render(<SummaryView />);
    expect(screen.getByText('Transcribe & Summarise')).toBeInTheDocument();
    expect(screen.getByText('Transcribe Only')).toBeInTheDocument();
  });

  it('shows "Summarise" button when transcript exists but no summary', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];
    mockSummaryState.transcript = { episodeId: 'ep1', text: 'transcript text', createdAt: Date.now(), model: 'whisper-1' };

    render(<SummaryView />);
    expect(screen.getByText('Summarise')).toBeInTheDocument();
    expect(screen.getByText('Summarise Only')).toBeInTheDocument();
    // "Transcribe Only" should NOT be shown when transcript exists
    expect(screen.queryByText('Transcribe Only')).not.toBeInTheDocument();
  });

  it('shows "Re-summarise" button when summary exists', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];
    mockSummaryState.transcript = { episodeId: 'ep1', text: 'transcript text', createdAt: Date.now(), model: 'whisper-1' };
    mockSummaryState.summary = {
      episodeId: 'ep1',
      markdown: '# Summary\nSome content',
      provider: 'openai',
      model: 'gpt-5-mini',
      createdAt: Date.now(),
    };

    render(<SummaryView />);
    expect(screen.getByText('Re-summarise')).toBeInTheDocument();
    // "Transcribe & Summarise" should not be shown when summary exists
    expect(screen.queryByText('Transcribe & Summarise')).not.toBeInTheDocument();
  });

  it('renders summary markdown content', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];
    mockSummaryState.summary = {
      episodeId: 'ep1',
      markdown: '# Summary\nSome content here',
      provider: 'openai',
      model: 'gpt-5-mini',
      createdAt: Date.now(),
    };

    render(<SummaryView />);
    expect(screen.getByTestId('markdown')).toHaveTextContent('# Summary Some content here');
  });

  it('shows transcribing progress indicator', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];
    mockSummaryState.stage = 'transcribing';

    render(<SummaryView />);
    expect(screen.getByText('Transcribing audio... this may take a few minutes.')).toBeInTheDocument();
  });

  it('shows summarising progress indicator', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];
    mockSummaryState.stage = 'summarising';

    render(<SummaryView />);
    expect(screen.getByText('Generating summary...')).toBeInTheDocument();
  });

  it('shows error message when error exists', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];
    mockSummaryState.error = 'Transcription failed';

    render(<SummaryView />);
    expect(screen.getByText('Transcription failed')).toBeInTheDocument();
  });

  it('calls runPipeline when "Transcribe & Summarise" is clicked', async () => {
    const user = userEvent.setup();
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];

    render(<SummaryView />);
    await user.click(screen.getByText('Transcribe & Summarise'));
    expect(mockRunPipeline).toHaveBeenCalled();
  });

  it('calls runTranscription when "Transcribe Only" is clicked', async () => {
    const user = userEvent.setup();
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];

    render(<SummaryView />);
    await user.click(screen.getByText('Transcribe Only'));
    expect(mockRunTranscription).toHaveBeenCalled();
  });

  it('disables buttons when stage is not idle', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];
    mockSummaryState.stage = 'transcribing';

    render(<SummaryView />);
    expect(screen.getByText('Transcribe & Summarise')).toBeDisabled();
    expect(screen.getByText('Transcribe Only')).toBeDisabled();
  });

  it('shows episode description when no summary exists', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3', description: 'A great episode about testing.' },
    ];

    render(<SummaryView />);
    expect(screen.getByText('A great episode about testing.')).toBeInTheDocument();
  });

  it('hides episode description when summary exists', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3', description: 'A great episode about testing.' },
    ];
    mockSummaryState.summary = {
      episodeId: 'ep1',
      markdown: '# Summary',
      provider: 'openai',
      model: 'gpt-5-mini',
      createdAt: Date.now(),
    };

    render(<SummaryView />);
    // Description is still in the DOM inside a collapsed <details> element
    expect(screen.getByText('A great episode about testing.')).toBeInTheDocument();
    // The details element should NOT have the open attribute when summary exists
    const details = screen.getByText('Episode Description').closest('details');
    expect(details).not.toHaveAttribute('open');
  });

  it('shows transcript in details element when transcript exists but no summary', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];
    mockSummaryState.transcript = { episodeId: 'ep1', text: 'This is the transcript text.', createdAt: Date.now(), model: 'whisper-1' };

    render(<SummaryView />);
    expect(screen.getByText('View transcript')).toBeInTheDocument();
    expect(screen.getByText('This is the transcript text.')).toBeInTheDocument();
  });

  it('calls loadCached on mount', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];

    render(<SummaryView />);
    expect(mockLoadCached).toHaveBeenCalled();
  });

  it('shows provider info in summary footer', () => {
    mockFeedState.selectedEpisodeId = 'ep1';
    mockFeedState.episodes = [
      { guid: 'ep1', title: 'My Episode', audioUrl: 'https://example.com/audio.mp3' },
    ];
    mockSummaryState.summary = {
      episodeId: 'ep1',
      markdown: '# Summary',
      provider: 'openai',
      model: 'gpt-5-mini',
      createdAt: new Date('2025-06-15T12:00:00Z').getTime(),
    };

    render(<SummaryView />);
    expect(screen.getByText(/Generated by openai \(gpt-5-mini\)/)).toBeInTheDocument();
  });
});
