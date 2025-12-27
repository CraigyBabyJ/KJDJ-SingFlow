import React, { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import QueuePanel from './QueuePanel';
import { isVocalTrack, toTitleCase } from '../lib/text';
import QRCode from 'qrcode';

const HostController = ({
    user,
    onLogout,
    onLoadNext,
    currentSelection,
    upcoming = [],
    playbackStatus = 'stopped',
    playbackTime = { current: 0, duration: 0 },
    onPanicStop,
    onResyncDisplay,
    loadNextStatus = { pending: false, error: '' },
    children,
}) => {
    const [singers, setSingers] = useState([]);
    const [queue, setQueue] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [songs, setSongs] = useState([]);
    const [selectedSinger, setSelectedSinger] = useState('');
    const [newSingerName, setNewSingerName] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [libraryStatus, setLibraryStatus] = useState(null);
    const [rotationEnabled, setRotationEnabled] = useState(true);
    const [queuedSongIdsLocal, setQueuedSongIdsLocal] = useState([]);
    const [queueOrder, setQueueOrder] = useState([]);
    const [singerNotice, setSingerNotice] = useState('');
    const [deleteNotice, setDeleteNotice] = useState('');
    const [joinQr, setJoinQr] = useState('');
    const [showInvite, setShowInvite] = useState(false);
    const [showHosts, setShowHosts] = useState(false);
    const [hostList, setHostList] = useState([]);
    const [hostError, setHostError] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);

    const fetchData = async () => {
        try {
            const [singersRes, queueRes] = await Promise.all([
                axios.get('/api/singers'),
                axios.get('/api/queue')
            ]);
            setSingers(singersRes.data);
            let nextQueue = queueRes.data;
            if (!rotationEnabled && queueOrder.length > 0) {
                const orderIndex = new Map(queueOrder.map((id, index) => [id, index]));
                nextQueue = [...queueRes.data].sort((a, b) => {
                    const aIdx = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
                    const bIdx = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
                    if (aIdx !== bIdx) return aIdx - bIdx;
                    return 0;
                });
            }
            setQueue(nextQueue);
            setQueuedSongIdsLocal((prev) => prev.filter(id => !queueRes.data.some(item => item.song_id === id)));
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [refreshTrigger]);

    const fetchRotationSetting = async () => {
        try {
            const res = await axios.get('/api/rotation/settings');
            setRotationEnabled(res.data.rotationEnabled);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchRotationSetting();
    }, []);
    useEffect(() => {
        if (rotationEnabled) {
            setQueueOrder([]);
        }
    }, [rotationEnabled]);

    const fetchLibraryStatus = async () => {
        try {
            const res = await axios.get('/api/library/status');
            setLibraryStatus(res.data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchLibraryStatus();
        const interval = setInterval(fetchLibraryStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    const searchSongs = async () => {
        if (!searchQuery) return;
        try {
            const res = await axios.get(`/api/library/search?q=${searchQuery}`);
            setSongs((res.data || []).filter(song => !isVocalTrack(song)));
        } catch (err) { console.error(err); }
    };

    const handleRotationToggle = async (enabled) => {
        try {
            await axios.patch('/api/rotation/settings', { rotationEnabled: enabled });
            setRotationEnabled(enabled);
        } catch (err) {
            console.error(err);
        }
    };

    const handleQueueSong = async (song) => {
        const name = newSingerName || selectedSinger;
        if (!name) {
            setSingerNotice('Select a singer first.');
            return;
        }

        try {
            const res = await axios.post('/api/queue', { songId: song.id, singerName: name });
            const { queueId, singerId } = res.data || {};
            if (queueId && singerId) {
                setQueue(prev => ([
                    ...prev,
                    {
                        id: queueId,
                        singer_id: singerId,
                        song_id: song.id,
                        singer_name: name.trim(),
                        title: song.title,
                        artist: song.artist,
                        file_path: song.file_path,
                        status: 'queued'
                    }
                ]));
            }
            setQueuedSongIdsLocal(prev => (prev.includes(song.id) ? prev : [...prev, song.id]));
            fetchData();
            setSingerNotice('');
            setNewSingerName('');
        } catch (err) {
            console.error("Failed to queue:", err);
            setSingerNotice('Failed to queue song.');
        }
    };

    const handleDeleteSinger = async () => {
        const singer = singers.find(item => item.name === selectedSinger);
        if (!singer) {
            setDeleteNotice('Select a singer to delete.');
            return;
        }
        try {
            await axios.delete(`/api/singers/${singer.id}`);
            setDeleteNotice('Singer deleted.');
            setSelectedSinger('');
            setNewSingerName('');
            fetchData();
        } catch (err) {
            setDeleteNotice('Failed to delete singer.');
        }
    };

    const handleRefreshLibrary = async () => {
        try {
            await axios.post('/api/library/refresh');
            fetchLibraryStatus();
        } catch (err) {
            console.error("Failed to refresh library:", err);
        }
    };

    const orderedQueue = useMemo(() => queue, [queue]);

    const queuedCounts = useMemo(() => {
        return orderedQueue.reduce((acc, item) => {
            acc[item.singer_id] = (acc[item.singer_id] || 0) + 1;
            return acc;
        }, {});
    }, [orderedQueue]);

    const queuedSongIds = useMemo(() => {
        return new Set([
            ...orderedQueue.map(item => item.song_id),
            ...queuedSongIdsLocal
        ]);
    }, [orderedQueue, queuedSongIdsLocal]);

    const upcomingFiltered = useMemo(() => {
        const seen = new Set();
        const unique = [];
        for (const item of upcoming) {
            if (seen.has(item.singer_id)) continue;
            seen.add(item.singer_id);
            unique.push(item);
        }
        return unique;
    }, [upcoming]);
    const joinUrl = user?.invite_token ? `${window.location.origin}/join/${user.invite_token}` : '';

    useEffect(() => {
        if (!joinUrl) {
            setJoinQr('');
            return;
        }
        let cancelled = false;
        QRCode.toDataURL(joinUrl, { margin: 1, width: 120 })
            .then((url) => {
                if (!cancelled) {
                    setJoinQr(url);
                }
            })
            .catch((err) => {
                console.error('Failed to generate QR code', err);
            });
        return () => {
            cancelled = true;
        };
    }, [joinUrl]);

    useEffect(() => {
        if (!showHosts) return;
        const fetchHosts = async () => {
            try {
                const res = await axios.get('/api/admin/hosts');
                setHostList(res.data || []);
                setHostError('');
            } catch (err) {
                setHostError(err.response?.data?.error || 'Failed to load hosts');
            }
        };
        fetchHosts();
    }, [showHosts]);

    const handleDeleteHost = async (hostId) => {
        try {
            await axios.delete(`/api/admin/hosts/${hostId}`);
            setHostList(prev => prev.filter(host => host.id !== hostId));
            setConfirmDeleteId(null);
        } catch (err) {
            setHostError(err.response?.data?.error || 'Failed to delete host');
        }
    };

    return (
        <div className="flex h-screen flex-col overflow-hidden">
            <div className="border-b border-zinc-800 bg-zinc-950/60 px-6 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-xl font-semibold text-zinc-100 drop-shadow-[0_0_12px_rgba(255,255,255,0.25)]">
                            KJDJ SingFlow
                        </div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.3em] text-zinc-400">Let’s keep the mic moving.</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
                        {joinUrl && (
                            <button
                                onClick={() => setShowInvite(true)}
                                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-zinc-500 hover:text-white"
                            >
                                🎤 Invite
                            </button>
                        )}
                        {(user.username || '').trim().toLowerCase().includes('craig') && (
                            <button
                                onClick={() => setShowHosts(true)}
                                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-zinc-500 hover:text-white"
                            >
                                Hosts
                            </button>
                        )}
                        <div className="hidden sm:block">
                            {libraryStatus?.isScanning
                                ? `Scanning ${libraryStatus.scanProgress?.current || 0}/${libraryStatus.scanProgress?.total || 0}`
                                : `Library: ${libraryStatus?.songCount ?? 0} songs`}
                        </div>
                        <button
                            onClick={onLogout}
                            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-zinc-500 hover:text-white"
                        >
                            Logout
                        </button>
                        <span className="text-[11px] text-zinc-500">Signed in as {toTitleCase(user.username)}</span>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden p-4 pb-8">
                <div className="grid h-full min-h-0 gap-4 lg:grid-cols-3 lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
                    <div className="order-3 flex h-full min-h-0 flex-col gap-4 lg:order-none">
                        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 lg:min-h-[420px]">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-semibold">Add to Queue</h3>
                                    <p className="text-sm text-zinc-400">Search the library and add singers</p>
                                </div>
                                <label className="flex items-center gap-2 text-xs text-zinc-400">
                                    <input
                                        type="checkbox"
                                        checked={!!rotationEnabled}
                                        onChange={(e) => handleRotationToggle(e.target.checked)}
                                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                                    />
                                    Rotate Singer
                                </label>
                            </div>

                            <div className="mt-4">
                                <label className="text-xs uppercase tracking-widest text-zinc-500">Singer</label>
                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                                <select
                                    value={selectedSinger}
                                    onChange={e => { setSelectedSinger(e.target.value); setNewSingerName(''); }}
                                    className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    >
                                        <option value="">New / Select</option>
                                        {singers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                    </select>
                                <input
                                    type="text"
                                    placeholder="Or type new name..."
                                    value={newSingerName}
                                    onChange={e => { setNewSingerName(e.target.value); setSelectedSinger(''); }}
                                    className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                            <div className="mt-2 min-h-[16px] text-xs text-amber-400">
                                {singerNotice}
                            </div>
                            <div className="mt-2 flex items-center gap-3">
                                <button
                                    onClick={handleDeleteSinger}
                                    className="rounded-lg border border-red-500/60 px-3 py-1 text-xs text-red-300 transition hover:border-red-400 hover:text-red-200"
                                >
                                    Delete Singer
                                </button>
                                <span className="min-h-[16px] text-xs text-amber-400">{deleteNotice}</span>
                            </div>
                        </div>

                            <div className="mt-4 flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Search songs..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && searchSongs()}
                                    className="h-11 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                                <button
                                    onClick={searchSongs}
                                    className="h-11 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                                >
                                    Search
                                </button>
                            </div>

                            <div className="mt-4 flex-1 min-h-0 overflow-y-auto rounded-lg border border-zinc-800">
                                {songs.length === 0 ? (
                                    <div className="p-4 text-sm text-zinc-500">Search results will appear here.</div>
                                ) : (
                                    songs.map(song => (
                                        <div
                                            key={song.id}
                                            title={song.file_path || ''}
                                            className="flex items-center justify-between gap-3 border-b border-zinc-800 px-2 py-0.5 last:border-b-0"
                                        >
                                            <div className="text-sm font-semibold text-zinc-100 truncate">
                                                {toTitleCase(song.title)} — {toTitleCase(song.artist)}
                                            </div>
                                            {queuedSongIds.has(song.id) ? (
                                                <span className="px-2 py-0.5 text-sm text-emerald-300" title="Already queued">
                                                    ✔️
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => handleQueueSong(song)}
                                                    className="rounded-full bg-transparent px-2 py-0.5 text-sm font-semibold text-emerald-300 transition hover:text-emerald-200"
                                                    aria-label="Add to queue"
                                                >
                                                    ➕
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="order-2 flex h-full min-h-0 flex-col gap-4 lg:order-none">
                        <QueuePanel
                            queue={orderedQueue}
                            onUpdate={fetchData}
                            onReorder={(nextQueue) => {
                                setQueue(nextQueue);
                                setQueueOrder(nextQueue.map(item => item.id));
                            }}
                            onPlayItem={async (queueId) => {
                                if (!queueId) return;
                                const newOrder = [queueId, ...orderedQueue.filter(item => item.id !== queueId).map(item => item.id)];
                                const orderIndex = new Map(newOrder.map((id, index) => [id, index]));
                                setQueue([...orderedQueue].sort((a, b) => orderIndex.get(a.id) - orderIndex.get(b.id)));
                                setQueueOrder(newOrder);

                                try {
                                    if (rotationEnabled && orderedQueue[0]?.id !== queueId) {
                                        await axios.patch('/api/rotation/settings', { rotationEnabled: false });
                                        setRotationEnabled(false);
                                    }
                                    await axios.patch('/api/queue/reorder', { queueIds: newOrder });
                                    await onLoadNext();
                                } catch (err) {
                                    console.error(err);
                                }
                            }}
                            rotationEnabled={rotationEnabled}
                        />
                    </div>

                    <div className="order-1 flex h-full min-h-0 flex-col gap-4 lg:order-none">
                        <div className="order-2 flex min-h-0 flex-col rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 lg:order-none lg:min-h-[260px]">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">Up Next</div>
                                    <div className="text-lg font-semibold">Rotation Preview</div>
                                </div>
                            </div>
                            <div className="mt-3 max-h-[200px] overflow-y-auto">
                                {upcomingFiltered.length === 0 ? (
                                    <div className="text-sm text-zinc-500">No one queued yet.</div>
                                ) : (
                                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                        {upcomingFiltered.slice(0, 9).map((item) => (
                                            <div key={item.queue_id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm">
                                                <div className="truncate font-semibold text-zinc-100">
                                                    {item.singer_name}
                                                </div>
                                                <div className="text-xs text-zinc-400">
                                                    {queuedCounts[item.singer_id] || 0}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="order-1 flex flex-1 flex-col rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 lg:order-none lg:min-h-[420px]">
                            <div className="flex-1 min-h-0">
                                {children}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="border-t border-zinc-800 bg-zinc-950/40 px-6 py-3 text-center text-xs text-zinc-500">
                <a
                    href="https://discord.craigybabyj.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-zinc-800 p-2 text-zinc-400 transition hover:text-white"
                    aria-label="Discord"
                >
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                        <path d="M19.54 0a1.86 1.86 0 0 0-1.4.67c-.77 1.02-1.52 2.15-2.05 3.34a21.4 21.4 0 0 0-4.08-.42c-1.4 0-2.78.14-4.1.42A14.1 14.1 0 0 0 5.86.67 1.86 1.86 0 0 0 4.46 0C2.1.25.6 2.3.3 4.6a23.4 23.4 0 0 0-.3 3.7c0 4.23 1.62 8.35 4.88 10.92.8.64 1.7 1.15 2.65 1.53.37.14.78-.03.95-.39l.62-1.32c-.95-.36-1.85-.84-2.66-1.44.22-.16.43-.33.63-.51 3.64 1.7 7.57 1.7 11.2 0 .2.18.41.35.63.51-.81.6-1.71 1.08-2.66 1.44l.62 1.32c.17.36.58.53.95.39.95-.38 1.85-.89 2.65-1.53 3.26-2.57 4.88-6.69 4.88-10.92 0-1.26-.1-2.5-.3-3.7C23.4 2.3 21.9.25 19.54 0zM8.9 13.9c-.8 0-1.45-.75-1.45-1.67 0-.92.65-1.67 1.45-1.67s1.45.75 1.45 1.67c0 .92-.65 1.67-1.45 1.67zm6.2 0c-.8 0-1.45-.75-1.45-1.67 0-.92.65-1.67 1.45-1.67s1.45.75 1.45 1.67c0 .92-.65 1.45-1.45 1.67z"/>
                    </svg>
                </a>
                <div className="mt-2">craigybabyj © 2025</div>
            </div>
            {showInvite && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
                    <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-soft">
                        <div className="flex items-center justify-between">
                            <div className="text-lg font-semibold">Invite Singers</div>
                            <button
                                onClick={() => setShowInvite(false)}
                                className="text-zinc-400 hover:text-white"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="mt-6 flex flex-col items-center gap-4">
                            {joinQr && (
                                <img
                                    src={joinQr}
                                    alt="Join QR"
                                    className="h-48 w-48 rounded bg-white p-2"
                                />
                            )}
                            <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
                                {joinUrl}
                            </div>
                            <button
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(joinUrl);
                                    } catch (err) {
                                        console.error('Copy failed', err);
                                    }
                                }}
                                className="h-10 w-full rounded-lg bg-emerald-500 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showHosts && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
                    <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-soft">
                        <div className="flex items-center justify-between">
                            <div className="text-lg font-semibold">Hosts</div>
                            <button
                                onClick={() => setShowHosts(false)}
                                className="text-zinc-400 hover:text-white"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="mt-4 space-y-3">
                            {hostError && <div className="text-sm text-amber-400">{hostError}</div>}
                            {hostList.length === 0 ? (
                                <div className="text-sm text-zinc-500">No hosts found.</div>
                            ) : (
                                hostList.map((host) => (
                                    <div key={host.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-semibold text-zinc-100">{toTitleCase(host.username)}</div>
                                                <div className="text-xs text-zinc-400">
                                                    {host.status} · {host.songs_played || 0} played · Last login: {host.last_login ? new Date(host.last_login).toLocaleString() : 'Never'}
                                                </div>
                                            </div>
                                            {user.id !== host.id && (
                                                confirmDeleteId === host.id ? (
                                                    <div className="flex items-center gap-2 text-xs">
                                                        <button
                                                            onClick={() => handleDeleteHost(host.id)}
                                                            className="rounded-lg bg-red-500 px-3 py-1 text-zinc-100"
                                                        >
                                                            Confirm
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmDeleteId(null)}
                                                            className="rounded-lg border border-zinc-700 px-3 py-1 text-zinc-200"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setConfirmDeleteId(host.id)}
                                                        className="rounded-lg border border-red-500/60 px-3 py-1 text-xs text-red-300 transition hover:border-red-400 hover:text-red-200"
                                                    >
                                                        Delete
                                                    </button>
                                                )
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HostController;
