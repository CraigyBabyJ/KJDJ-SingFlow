import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { isVocalTrack, toTitleCase } from '../lib/text';

const SingerRequestPage = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [songs, setSongs] = useState([]);
    const [message, setMessage] = useState('');
    const [session, setSession] = useState(null);
    const [status, setStatus] = useState('loading');

    const fetchSession = async () => {
        try {
            const res = await axios.get('/api/join/session');
            setSession(res.data);
            setStatus('ready');
        } catch (err) {
            setStatus('no-session');
        }
    };

    useEffect(() => {
        fetchSession();
    }, []);

    const searchSongs = async () => {
        if (!searchQuery.trim()) return;
        try {
            const res = await axios.get(`/api/library/search?q=${searchQuery}`);
            setSongs((res.data || []).filter(song => !isVocalTrack(song)));
            setMessage('');
        } catch (err) {
            console.error(err);
            setMessage('Search failed');
        }
    };

    const handleQueue = async (song) => {
        try {
            await axios.post('/api/queue', { songId: song.id });
            setMessage('Added to queue ✅');
        } catch (err) {
            setMessage('Failed to queue: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleEndSession = async () => {
        try {
            await axios.post('/api/join/end');
            setSession(null);
            setStatus('no-session');
        } catch (err) {
            console.error(err);
        }
    };

    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center p-6">
                <div className="text-sm text-zinc-400">Loading…</div>
            </div>
        );
    }

    if (status === 'no-session') {
        return (
            <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center p-6">
                <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6 text-center">
                    <h1 className="text-xl font-semibold">Scan the Host QR to Join</h1>
                    <p className="mt-2 text-sm text-zinc-400">You need a valid invite token to add songs.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-100">
            <div className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 px-4 py-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">Add Songs</h1>
                        <p className="text-sm text-zinc-400">Queued as: {session?.displayName}</p>
                        <p className="text-xs text-zinc-500">Connected to {session?.hostName}</p>
                    </div>
                    <button
                        onClick={handleEndSession}
                        className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:border-zinc-500"
                    >
                        End Session
                    </button>
                </div>

                <div className="mt-4 flex gap-2">
                    <input
                        type="text"
                        placeholder="Search songs..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchSongs()}
                        className="h-12 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-4 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                        onClick={searchSongs}
                        className="h-12 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                    >
                        Search
                    </button>
                </div>

                {message && (
                    <div className="mt-3 text-sm text-zinc-300">
                        {message}
                    </div>
                )}
            </div>

            <div className="px-4 pb-10 pt-4">
                <div className="space-y-3">
                    {songs.length === 0 ? (
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-6 text-sm text-zinc-500">
                            Search results will appear here.
                        </div>
                    ) : (
                        songs.map(song => (
                            <div
                                key={song.id}
                                title={song.file_path || ''}
                                className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4"
                            >
                                <div className="flex-1">
                                    <div className="text-base font-semibold">{toTitleCase(song.title)} — {toTitleCase(song.artist)}</div>
                                </div>
                                <button
                                    onClick={() => handleQueue(song)}
                                    className="h-12 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                                >
                                    Add
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default SingerRequestPage;
