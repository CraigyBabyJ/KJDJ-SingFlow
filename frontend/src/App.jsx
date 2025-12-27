import React, { useState, useEffect } from 'react';
import axios from 'axios';
import KaraokePlayer from './components/KaraokePlayer';
import HostController from './components/HostController';
import SingerRequestPage from './components/SingerRequestPage';
import JoinPage from './components/JoinPage';

function App() {
  const [token, setToken] = useState(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
    }
    return storedToken;
  });
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [path, setPath] = useState(window.location.pathname || '/');
  
  // Playback State
  const [selectedSongId, setSelectedSongId] = useState(null);
  const [currentSelection, setCurrentSelection] = useState(null); // Full object: { song_id, title, artist, singer_name }
  const [nextUp, setNextUp] = useState(null); // The immediate next singer
  const [upcoming, setUpcoming] = useState([]); // List of next 3-5 singers
  const [showNextUp, setShowNextUp] = useState(true);
  const playerRef = React.useRef(null);
  const [audioAnalyser, setAudioAnalyser] = useState(null);
  const [playbackStatus, setPlaybackStatus] = useState('stopped');
  const [playbackTime, setPlaybackTime] = useState({ current: 0, duration: 0 });
  const [loadNextStatus, setLoadNextStatus] = useState({ pending: false, error: '' });
  
  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.defaults.withCredentials = true;
  }, []);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (nextPath) => {
    const target = nextPath || '/';
    if (window.location.pathname !== target) {
      window.history.pushState({}, '', target);
      setPath(target);
    }
  };

  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchRotationData();
      fetchCurrentUser();
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  const fetchCurrentUser = async () => {
    try {
      const res = await axios.get('/api/auth/me');
      const nextUser = res.data?.user || null;
      if (nextUser) {
        localStorage.setItem('user', JSON.stringify(nextUser));
        setUser(nextUser);
      }
    } catch (err) {
      console.error('Failed to fetch current user:', err);
    }
  };

  // Poll for Rotation Data
  useEffect(() => {
      if (token && (user?.role === 'HOST' || user?.role === 'admin')) {
          const interval = setInterval(fetchRotationData, 5000);
          return () => clearInterval(interval);
      }
  }, [token, user]);

  const fetchRotationData = async () => {
      try {
          const [nextRes, upcomingRes] = await Promise.all([
              axios.get('/api/rotation/next'),
              axios.get('/api/rotation/upcoming')
          ]);
          setNextUp(nextRes.data.selection);
          setUpcoming(upcomingRes.data || []);
      } catch (err) {
          console.error("Error fetching rotation data:", err);
      }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('/api/auth/login', { username, password });
      const { token, user } = res.data;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      setToken(token);
      setUser(user);
      setError('');
      if (user.role === 'HOST' || user.role === 'admin') {
        navigate('/');
      } else {
        navigate('/request');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
        const role = 'HOST';
        if (inviteCode.trim() !== '6969') {
          setError('Invalid invite code');
          return;
        }
        await axios.post('/api/auth/register', { username, password, role, inviteCode });
        handleLogin({ preventDefault: () => {} });
    } catch (err) {
        setError(err.response?.data?.error || 'Registration failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
    navigate('/');
  };

  const handleLoadNext = async () => {
      setLoadNextStatus({ pending: true, error: '' });
      try {
          const res = await axios.post('/api/playback/load-next');
          const selection = res.data;
          if (selection && selection.song_id) {
              setSelectedSongId(selection.song_id);
              setCurrentSelection(selection);
              setShowNextUp(false);
              setLoadNextStatus({ pending: false, error: '' });
              fetchRotationData(); // Refresh immediately
              return selection;
          } else {
              console.warn("No song loaded. Queue might be empty.");
              setLoadNextStatus({ pending: false, error: 'No song loaded.' });
              return null;
          }
      } catch (err) {
          console.error("Failed to load next:", err);
          setLoadNextStatus({ pending: false, error: err.response?.data?.message || err.message || 'Failed to load next.' });
          return null;
      }
  };

  const handleSongEnded = React.useCallback(async () => {
    if (!currentSelection?.queue_id) {
      return;
    }
    try {
      await axios.post(`/api/queue/${currentSelection.queue_id}/mark-done`);
      setSelectedSongId(null);
      setCurrentSelection(null);
      setShowNextUp(true);
      fetchRotationData();
    } catch (err) {
      console.error('Failed to mark done:', err);
    }
  }, [currentSelection]);

  const handleSongError = React.useCallback((e) => {
    console.error('Player error:', e);
  }, []);

  const handlePanicStop = React.useCallback(() => {
    if (playerRef.current) {
      playerRef.current.panicStop();
    }
    setSelectedSongId(null);
    setCurrentSelection(null);
    setShowNextUp(true);
    setPlaybackStatus('stopped');
    setPlaybackTime({ current: 0, duration: 0 });
  }, []);

  const handleResyncDisplay = React.useCallback(() => {
    if (playerRef.current) {
      playerRef.current.resyncDisplay();
    }
  }, []);

  const joinToken = path.startsWith('/join/') ? path.split('/').filter(Boolean)[1] : null;

  if (joinToken) {
    return <JoinPage token={joinToken} />;
  }

  const role = user?.role ? user.role.toLowerCase() : '';

  if (token && user && (role === 'host' || role === 'admin')) {
      return (
        <div className="min-h-screen bg-zinc-900 text-zinc-100">
          <HostController
            user={user}
            onLogout={handleLogout}
            onLoadNext={handleLoadNext}
            currentSelection={currentSelection}
            upcoming={upcoming}
            playbackStatus={playbackStatus}
            playbackTime={playbackTime}
            onPanicStop={handlePanicStop}
            onResyncDisplay={handleResyncDisplay}
            loadNextStatus={loadNextStatus}
            audioAnalyser={audioAnalyser}
          >
            <KaraokePlayer
              ref={playerRef}
              songId={selectedSongId}
              currentSelection={currentSelection}
              onEnded={handleSongEnded}
              onError={handleSongError}
              nextUp={nextUp}
              showNextUp={showNextUp}
              onPlaybackStatus={setPlaybackStatus}
              onTimeUpdate={(current, duration) => setPlaybackTime({ current, duration })}
              onResyncDisplay={handleResyncDisplay}
              onLoadNext={handleLoadNext}
              onAnalyserReady={setAudioAnalyser}
            />
          </HostController>
        </div>
      );
  }

  if (path.startsWith('/request')) {
      return <SingerRequestPage />;
  }

  if (!token || !user) {
    if (token && !user) {
      // Guard against stale token without user metadata.
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
    }
    return (
      <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/70 p-8 shadow-soft">
          <h1 className="text-2xl font-semibold text-center text-zinc-100 drop-shadow-[0_0_12px_rgba(255,255,255,0.25)]">KJDJ Login</h1>
          <p className="mt-2 text-center text-[11px] font-medium uppercase tracking-[0.3em] text-zinc-400">Let’s keep the mic moving.</p>
          <p className="mt-2 text-center text-sm text-zinc-400">Host access</p>
          <p className="mt-3 text-center text-xs text-zinc-500">
            Private System – Invited Bodies Only. Unauthorised use may be logged and prosecuted under the Computer Misuse Act 1990.
          </p>
          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="mt-6 flex flex-col gap-4">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="h-12 rounded-lg border border-zinc-800 bg-zinc-900 px-4 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="h-12 rounded-lg border border-zinc-800 bg-zinc-900 px-4 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {isRegistering && (
              <input
                type="text"
                placeholder="Invite code"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                className="h-12 rounded-lg border border-zinc-800 bg-zinc-900 px-4 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            )}
            <button
              type="submit"
              className="h-12 rounded-lg bg-emerald-500 font-semibold text-zinc-950 transition hover:bg-emerald-400 active:bg-emerald-300"
            >
              {isRegistering ? 'Register Host' : 'Login'}
            </button>
            <button
              type="button"
              onClick={() => setIsRegistering((prev) => !prev)}
              className="h-12 rounded-lg border border-zinc-700 text-zinc-100 transition hover:border-zinc-500 hover:text-white"
            >
              {isRegistering ? 'Back to Login' : 'Register'}
            </button>
            {error && <div className="text-center text-sm text-red-400">{error}</div>}
          </form>
        </div>
      </div>
    );
  }

  // SINGER VIEW
  if (role === 'singer') {
      return <SingerRequestPage />;
  }

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center p-6">
      <div className="text-sm text-zinc-400">Loading…</div>
    </div>
  );
}

export default App;
