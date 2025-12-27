import React, { useEffect, useState } from 'react';
import axios from 'axios';

const JoinPage = ({ token }) => {
    const [hostName, setHostName] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [status, setStatus] = useState('loading');
    const [error, setError] = useState('');
    const [suggestions, setSuggestions] = useState([]);

    useEffect(() => {
        const fetchHost = async () => {
            try {
                const res = await axios.get(`/api/join/${token}`);
                setHostName(res.data?.hostName || '');
                setStatus(res.data?.active ? 'ready' : 'inactive');
            } catch (err) {
                setStatus('error');
            }
        };
        fetchHost();
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuggestions([]);
        try {
            await axios.post(`/api/join/${token}`, { displayName });
            window.location.href = '/request';
        } catch (err) {
            if (err.response?.status === 409) {
                setError(err.response?.data?.error || 'Name already in use');
                setSuggestions(err.response?.data?.suggestions || []);
                return;
            }
            setError(err.response?.data?.error || 'Unable to join');
        }
    };

    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center p-6">
                <div className="text-sm text-zinc-400">Loading invite…</div>
            </div>
        );
    }

    if (status !== 'ready') {
        return (
            <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center p-6">
                <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6 text-center">
                    <h1 className="text-xl font-semibold">Invite Not Available</h1>
                    <p className="mt-2 text-sm text-zinc-400">Ask the host for a fresh QR code.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center p-6">
            <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6">
                <h1 className="text-2xl font-semibold">Join {hostName || 'the host'}</h1>
                <p className="mt-2 text-sm text-zinc-400">First name + initial (e.g., Jordan H)</p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Display name"
                        className="h-12 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                        type="submit"
                        className="h-12 w-full rounded-lg bg-emerald-500 font-semibold text-zinc-950 transition hover:bg-emerald-400"
                    >
                        Join Session
                    </button>
                </form>

                {error && (
                    <div className="mt-4 text-sm text-amber-400">{error}</div>
                )}

                {suggestions.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                        {suggestions.map((suggestion) => (
                            <button
                                key={suggestion}
                                type="button"
                                onClick={() => setDisplayName(suggestion)}
                                className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-200 transition hover:border-zinc-500"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default JoinPage;
