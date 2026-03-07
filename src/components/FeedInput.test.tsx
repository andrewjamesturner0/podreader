import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeedInput from './FeedInput';

const mockSubscribe = vi.fn();
const mockImportFeeds = vi.fn();

vi.mock('../hooks/useFeeds', () => ({
  useFeeds: () => ({
    subscribe: mockSubscribe,
    addYouTubeVideo: vi.fn(),
    importFeeds: mockImportFeeds,
    importProgress: null,
    loading: false,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FeedInput', () => {
  it('renders URL input and buttons', () => {
    render(<FeedInput />);
    expect(screen.getByPlaceholderText('Paste RSS feed or YouTube URL...')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getByText('Import OPML')).toBeInTheDocument();
  });

  it('Add button is disabled when input is empty', () => {
    render(<FeedInput />);
    expect(screen.getByText('Add')).toBeDisabled();
  });

  it('submits URL on form submit', async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue(undefined);
    render(<FeedInput />);
    await user.type(screen.getByPlaceholderText('Paste RSS feed or YouTube URL...'), 'https://example.com/feed.xml');
    await user.click(screen.getByText('Add'));
    expect(mockSubscribe).toHaveBeenCalledWith('https://example.com/feed.xml');
  });

  it('clears input after successful submit', async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue(undefined);
    render(<FeedInput />);
    const input = screen.getByPlaceholderText('Paste RSS feed or YouTube URL...');
    await user.type(input, 'https://example.com/feed.xml');
    await user.click(screen.getByText('Add'));
    expect(input).toHaveValue('');
  });

  it('enables Add button when input has a URL', async () => {
    const user = userEvent.setup();
    render(<FeedInput />);
    const addButton = screen.getByText('Add');
    expect(addButton).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Paste RSS feed or YouTube URL...'), 'https://example.com/feed.xml');
    expect(addButton).not.toBeDisabled();
  });

  it('has a hidden file input for OPML import', () => {
    render(<FeedInput />);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    expect(fileInput.accept).toBe('.opml,.xml');
    expect(fileInput.style.display).toBe('none');
  });
});
