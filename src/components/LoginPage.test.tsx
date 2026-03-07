import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './LoginPage';
import { AuthProvider } from '../hooks/useAuth';

// Mock fetch globally — AuthProvider calls /api/auth/me on mount
beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: 'Not logged in' }), { status: 401 })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderLoginPage() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );
}

describe('LoginPage', () => {
  it('renders sign in form', async () => {
    renderLoginPage();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
  });

  it('switches to register mode', async () => {
    const user = userEvent.setup();
    renderLoginPage();
    await user.click(screen.getByText('Need an account? Register'));
    expect(screen.getByText('Create Account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeInTheDocument();
  });

  it('switches back to login mode from register', async () => {
    const user = userEvent.setup();
    renderLoginPage();
    await user.click(screen.getByText('Need an account? Register'));
    expect(screen.getByText('Create Account')).toBeInTheDocument();
    await user.click(screen.getByText('Already have an account? Sign in'));
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('submits login form with correct credentials', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByPlaceholderText('Username'), 'testuser');
    await user.type(screen.getByPlaceholderText('Password'), 'password123');

    // Override mock for login response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true, username: 'testuser' }), { status: 200 })
    );

    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'password123' }),
    }));
  });

  it('displays error on login failure', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByPlaceholderText('Username'), 'testuser');
    await user.type(screen.getByPlaceholderText('Password'), 'wrongpass');

    // Override: login returns 401 with error message
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 })
    );

    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('shows loading state during submission', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByPlaceholderText('Username'), 'testuser');
    await user.type(screen.getByPlaceholderText('Password'), 'password123');

    // Make fetch hang to test loading state
    let resolveLogin!: (value: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise(resolve => { resolveLogin = resolve; })
    );

    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(screen.getByText('Please wait...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Please wait...' })).toBeDisabled();

    // Resolve the pending login
    resolveLogin(new Response(JSON.stringify({ username: 'testuser' }), { status: 200 }));

    await waitFor(() => {
      expect(screen.queryByText('Please wait...')).not.toBeInTheDocument();
    });
  });

  it('submits register form', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByText('Need an account? Register'));
    await user.type(screen.getByPlaceholderText('Username'), 'newuser');
    await user.type(screen.getByPlaceholderText('Password'), 'newpassword123');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ username: 'newuser' }), { status: 200 })
    );

    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(fetch).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'newuser', password: 'newpassword123' }),
    }));
  });
});
