import React, { useEffect, useRef, useState, useImperativeHandle } from 'react';
import axios from 'axios';
import JSZip from 'jszip';
import CDGPlayer from '../lib/cdg/CDGPlayer';
import PopoutWindow from './PopoutWindow';
import { toTitleCase } from '../lib/text';

const KaraokePlayer = React.memo(React.forwardRef(({
    songId,
    currentSelection,
    onEnded,
    onError,
    nextUp,
    showNextUp = true,
    onPlaybackStatus,
    onTimeUpdate,
    onResyncDisplay,
    onLoadNext,
    onAnalyserReady,
}, ref) => {
    const audioRef = useRef(null);
    const videoRef = useRef(null);
    const [canvasElement, setCanvasElement] = useState(null);
    const cdgPlayerRef = useRef(null);
    const cdgDataRef = useRef(null);
    const audioContextRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const analyserRef = useRef(null);
    const [status, setStatus] = useState('idle'); // idle, loading, ready, error
    const [mediaSrc, setMediaSrc] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);
    const [isPoppedOut, setIsPoppedOut] = useState(false);
    const [timeState, setTimeState] = useState({ current: 0, duration: 0 });
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(() => {
        const saved = localStorage.getItem('kjdj_volume');
        return saved !== null ? parseFloat(saved) : 1.0;
    });
    const [showVolume, setShowVolume] = useState(false);
    const popoutWindowRef = useRef(null);
    const canPlay = status === 'ready' && !!mediaSrc;
    const isVideoTrack = ((currentSelection?.media_type || currentSelection?.mediaType || '').toLowerCase() === 'mp4') ||
        (currentSelection?.file_path?.toLowerCase().endsWith('.mp4'));

    const getMediaElement = () => (isVideoTrack ? videoRef.current : audioRef.current);

    const initAudioContext = () => {
        const mediaEl = getMediaElement();
        // Initialize Web Audio API context for visualization
        if (mediaEl) {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                const ctx = audioContextRef.current || new AudioContext();
                const analyser = analyserRef.current || ctx.createAnalyser();
                analyser.fftSize = 64; // Low resolution for visualizer bars (32 bins)

                if (sourceNodeRef.current && sourceNodeRef.current.mediaElement !== mediaEl) {
                    try {
                        sourceNodeRef.current.disconnect();
                    } catch (e) {
                        // noop
                    }
                    sourceNodeRef.current = null;
                }

                if (!sourceNodeRef.current) {
                    const source = ctx.createMediaElementSource(mediaEl);
                    source.connect(analyser);
                    analyser.connect(ctx.destination);
                    sourceNodeRef.current = source;
                }

                audioContextRef.current = ctx;
                analyserRef.current = analyser;

                // Pass analyser up to parent component
                if (onAnalyserReady) {
                    onAnalyserReady(analyser);
                }
            } catch (err) {
                console.error("Failed to setup audio context:", err);
            }
        }
    };

    useEffect(() => {
        initAudioContext();
    }, [onAnalyserReady, isVideoTrack, mediaSrc]);

    useEffect(() => {
        const mediaEl = getMediaElement();

    }, [volume, mediaSrc, isVideoTrack]);

    useEffect(() => {
        return () => {
            if (cdgPlayerRef.current) {
                cdgPlayerRef.current.stop();
            }
            if (mediaSrc) {
                URL.revokeObjectURL(mediaSrc);
            }
        };
    }, [mediaSrc]);

    const sendDisplayState = (type = 'STATE') => {
        if (!popoutWindowRef.current) return;
        const mediaEl = getMediaElement();
        const playbackState = mediaEl
            ? (mediaEl.paused ? 'paused' : 'playing')
            : 'stopped';
        popoutWindowRef.current.postMessage({
            type: `KJDJ_${type}`,
            payload: {
                songId,
                status,
                playbackState,
                nextUp,
                showNextUp,
            },
        }, '*');
    };

    const sendDisplayStateBurst = () => {
        sendDisplayState('STATE');
        setTimeout(() => sendDisplayState('STATE'), 150);
        setTimeout(() => sendDisplayState('STATE'), 300);
    };

    useImperativeHandle(ref, () => ({
        panicStop: () => {
            const mediaEl = getMediaElement();
            if (mediaEl) {
                mediaEl.pause();
                mediaEl.currentTime = 0;
            }
            if (cdgPlayerRef.current) {
                cdgPlayerRef.current.stop();
                cdgPlayerRef.current.reset();
            }
            setMediaSrc(null);
            setStatus('idle');
            setErrorMsg(null);
            setTimeState({ current: 0, duration: 0 });
            onPlaybackStatus?.('stopped');
            sendDisplayState('STOP');
            sendDisplayState('STATE');
        },
        resyncDisplay: () => {
            sendDisplayStateBurst();
            const mediaEl = getMediaElement();
            if (mediaEl && cdgPlayerRef.current) {
                cdgPlayerRef.current.sync(mediaEl.currentTime * 1000);
            }
        },
    }));

    useEffect(() => {
        if (canvasElement && cdgDataRef.current) {
            if (cdgPlayerRef.current) {
                cdgPlayerRef.current.stop();
            }

            // CDGPlayer is treated as a drop-in renderer with a narrow surface area:
            // - constructor accepts a { contextOptions: { canvas, width, height } } bag
            // - load(cdgData) is called once the ZIP is parsed to a Uint8Array
            // - play/stop/reset mirror audio playback control flow
            // - sync(ms) is called from time updates and resyncs to align with audioRef
            // - rendering is expected to target the provided 300x216 canvas element
            cdgPlayerRef.current = new CDGPlayer({
                contextOptions: {
                    canvas: canvasElement,
                    width: 300,
                    height: 216
                }
            });

            cdgPlayerRef.current.load(cdgDataRef.current);

            if (audioRef.current && !audioRef.current.paused) {
                cdgPlayerRef.current.play();
            }
        }
    }, [canvasElement, status]);

    useEffect(() => {
        if (!songId) return;

        const loadSong = async () => {
            setStatus('loading');
            setErrorMsg(null);
            setMediaSrc(null);
            cdgDataRef.current = null;
            onPlaybackStatus?.('paused');

            [audioRef.current, videoRef.current].forEach((el) => {
                if (el) {
                    el.pause();
                    el.currentTime = 0;
                }
            });

            if (cdgPlayerRef.current) {
                cdgPlayerRef.current.stop();
                cdgPlayerRef.current.reset();
                if (canvasElement) {
                    const ctx = canvasElement.getContext('2d');
                    ctx.fillStyle = 'black';
                    ctx.fillRect(0, 0, 300, 216);
                }
            }

            try {
                const token = localStorage.getItem('token');
                const response = await axios.get(`/api/library/songs/${songId}/download`, {
                    responseType: 'blob',
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });

                if (isVideoTrack) {
                    const mp4Url = URL.createObjectURL(response.data);
                    setMediaSrc(mp4Url);
                    if (videoRef.current) {
                        videoRef.current.src = mp4Url;
                        try {
                            await videoRef.current.play();
                        } catch (e) {
                            console.log("Auto-play blocked, waiting for user interaction");
                        }
                    }
                    setStatus('ready');
                    return;
                }

                const zip = await JSZip.loadAsync(response.data);

                let mp3File = null;
                let cdgFile = null;

                zip.forEach((relativePath, file) => {
                    if (file.name.toLowerCase().endsWith('.mp3')) {
                        mp3File = file;
                    } else if (file.name.toLowerCase().endsWith('.cdg')) {
                        cdgFile = file;
                    }
                });

                if (!mp3File || !cdgFile) {
                    throw new Error('Missing MP3 or CDG file in ZIP');
                }

                const mp3Blob = await mp3File.async('blob');
                const mp3Url = URL.createObjectURL(mp3Blob);
                setMediaSrc(mp3Url);
                if (audioRef.current) {
                    audioRef.current.src = mp3Url;
                }

                const cdgBuffer = await cdgFile.async('uint8array');
                cdgDataRef.current = cdgBuffer;

                setStatus('ready');

                if (audioRef.current) {
                    try {
                        await audioRef.current.play();
                    } catch (e) {
                        console.log("Auto-play blocked, waiting for user interaction");
                    }
                }

            } catch (err) {
                console.error('Error loading song:', err);
                setStatus('error');
                setErrorMsg(err.message);
                if (onError) onError(err);
            }
        };

        loadSong();
    }, [songId, onError, isVideoTrack, canvasElement]);

    useEffect(() => {
        if (songId) return;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0;
        }
        if (cdgPlayerRef.current) {
            cdgPlayerRef.current.stop();
            cdgPlayerRef.current.reset();
        }
        cdgDataRef.current = null;
        setMediaSrc(null);
        setStatus('idle');
        setErrorMsg(null);
        setTimeState({ current: 0, duration: 0 });
        setIsPlaying(false);
    }, [songId]);

    useEffect(() => {
        if (!isPoppedOut) return;
        sendDisplayState('STATE');
    }, [isPoppedOut, showNextUp, nextUp, status, songId]);

    const handlePlay = async () => {
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        if (!canPlay) {
            if (onLoadNext) {
                const selection = await onLoadNext();
                if (!selection) {
                    return;
                }
            }
            return;
        }
        if (cdgPlayerRef.current) cdgPlayerRef.current.play();
        const mediaEl = getMediaElement();
        if (mediaEl) mediaEl.play();
        setIsPlaying(true);
        onPlaybackStatus?.('playing');
    };

    const handlePause = () => {
        if (cdgPlayerRef.current) cdgPlayerRef.current.stop();
        const mediaEl = getMediaElement();
        if (mediaEl) mediaEl.pause();
        setIsPlaying(false);
        onPlaybackStatus?.('paused');
    };

    const handleStop = () => {
        const mediaEl = getMediaElement();
        if (mediaEl) {
            mediaEl.pause();
            mediaEl.currentTime = 0;
        }
        if (cdgPlayerRef.current) {
            cdgPlayerRef.current.stop();
            cdgPlayerRef.current.reset();
        }
        setTimeState({ current: 0, duration: mediaEl?.duration || 0 });
        onTimeUpdate?.(0, mediaEl?.duration || 0);
        setIsPlaying(false);
        onPlaybackStatus?.('stopped');
    };

    const handleMediaPlayEvent = () => {
        initAudioContext();
        if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
        }
        setIsPlaying(true);
        onPlaybackStatus?.('playing');
    };

    const handleTimeUpdate = () => {
        const mediaEl = getMediaElement();
        if (!mediaEl) return;
        const currentTime = mediaEl.currentTime;
        if (cdgPlayerRef.current && cdgDataRef.current) {
            cdgPlayerRef.current.sync(currentTime * 1000);
        }
        setTimeState({ current: currentTime, duration: mediaEl.duration || 0 });
        onTimeUpdate?.(currentTime, mediaEl.duration || 0);
    };

    const handleEnded = () => {
        const mediaEl = getMediaElement();
        if (mediaEl) {
            mediaEl.pause();
        }
        if (cdgPlayerRef.current) {
            cdgPlayerRef.current.stop();
            cdgPlayerRef.current.reset();
        }
        setIsPlaying(false);
        onPlaybackStatus?.('stopped');
        if (onEnded) onEnded();
    };

    const handleSeek = (value) => {
        const mediaEl = getMediaElement();
        if (!mediaEl) return;
        const nextTime = Number(value);
        mediaEl.currentTime = nextTime;
        if (cdgPlayerRef.current) {
            cdgPlayerRef.current.sync(nextTime * 1000);
        }
        setTimeState({ current: nextTime, duration: mediaEl.duration || 0 });
        onTimeUpdate?.(nextTime, mediaEl.duration || 0);
    };

    const formatTime = (seconds) => {
        if (!Number.isFinite(seconds)) return '--:--';
        const minutes = Math.floor(seconds / 60);
        const remaining = Math.floor(seconds % 60);
        return `${minutes}:${remaining.toString().padStart(2, '0')}`;
    };

    const renderPlaceholder = () => (
        <div className="text-center text-sm text-zinc-500">
            Lyrics will appear here
        </div>
    );

    const renderNextUp = () => {
        if (!nextUp) {
            return (
                <div className="text-center text-sm text-zinc-400">
                    Waiting for songs...
                </div>
            );
        }
        return (
            <div className="text-center text-zinc-100">
                <div className="text-xs uppercase tracking-[0.3em] text-emerald-400">Up Next</div>
                <div className="mt-3 text-2xl font-semibold">{nextUp.singer_name}</div>
                <div className="mt-1 text-sm text-zinc-300">{toTitleCase(nextUp.title)}</div>
                <div className="text-xs text-zinc-500">{toTitleCase(nextUp.artist)}</div>
            </div>
        );
    };

    const renderIdle = () => (showNextUp ? renderNextUp() : renderPlaceholder());
    const nowSinger = currentSelection?.singer_name || '';
    const nowSong = currentSelection ? `${toTitleCase(currentSelection.title)} — ${toTitleCase(currentSelection.artist)}` : '';

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.3em] text-zinc-500">Deck</div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onResyncDisplay?.()}
                        className="bg-transparent text-xl text-zinc-100 hover:text-white"
                        aria-label="Re-Sync"
                    >
                        🔄
                    </button>
                    <button
                        onClick={() => setIsPoppedOut(!isPoppedOut)}
                        className="bg-transparent text-xl text-zinc-100 hover:text-white"
                        aria-label={isPoppedOut ? 'Dock' : 'Pop-Out'}
                    >
                        {isPoppedOut ? '🧷' : '🪟'}
                    </button>
                </div>
            </div>
            {isPoppedOut ? (
                <PopoutWindow
                    onClose={() => { popoutWindowRef.current = null; setIsPoppedOut(false); }}
                    title="Karaoke Screen"
                    onWindowReady={(win) => { popoutWindowRef.current = win; sendDisplayState('STATE'); }}
                >
                    <div className="flex h-full w-full items-center justify-center bg-black">
                        {status === 'idle' || status === 'loading' ? renderIdle() : (
                            isVideoTrack ? (
                                <video
                                    ref={videoRef}
                                    src={isVideoTrack ? mediaSrc : undefined}
                                    width={300}
                                    height={216}
                                    className="h-full w-full object-contain"
                                    playsInline
                                    onPlay={handleMediaPlayEvent}
                                    onTimeUpdate={handleTimeUpdate}
                                    onEnded={handleEnded}
                                    onLoadedMetadata={handleTimeUpdate}
                                />
                            ) : (
                                <canvas
                                    ref={setCanvasElement}
                                    width={300}
                                    height={216}
                                    style={{ width: '100%', height: '100%', display: 'block' }}
                                />
                            )
                        )}
                    </div>
                </PopoutWindow>
            ) : (
                <div className="flex items-center justify-center rounded-2xl border border-zinc-800 bg-black p-4">
                    <div className="flex h-[216px] w-[300px] items-center justify-center">
                        {status === 'idle' || status === 'loading' ? renderIdle() : (
                            isVideoTrack ? (
                                <video
                                    ref={videoRef}
                                    src={isVideoTrack ? mediaSrc : undefined}
                                    width={300}
                                    height={216}
                                    className="h-full w-full object-contain"
                                    playsInline
                                    onPlay={handleMediaPlayEvent}
                                    onTimeUpdate={handleTimeUpdate}
                                    onEnded={handleEnded}
                                    onLoadedMetadata={handleTimeUpdate}
                                />
                            ) : (
                                <canvas
                                    ref={setCanvasElement}
                                    width={300}
                                    height={216}
                                    className="h-full w-full"
                                />
                            )
                        )}
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <button
                        onClick={isPlaying ? handlePause : handlePlay}
                        className={`bg-transparent text-xl ${(canPlay || onLoadNext) ? 'text-zinc-100 hover:text-white' : 'text-zinc-600'}`}
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                        aria-disabled={!canPlay && !onLoadNext}
                    >
                        {isPlaying ? '⏸️' : '▶️'}
                    </button>
                    <button
                        onClick={async () => {
                            const selection = await onLoadNext?.();
                            if (!selection) {
                                const mediaEl = getMediaElement();
                                if (mediaEl) {
                                    mediaEl.pause();
                                }
                                if (cdgPlayerRef.current) {
                                    cdgPlayerRef.current.stop();
                                }
                                setIsPlaying(false);
                                onPlaybackStatus?.('stopped');
                            }
                        }}
                        className="bg-transparent text-xl text-zinc-100 hover:text-white"
                        aria-label="Load next"
                    >
                        ⏭️
                    </button>
                    <button
                        onClick={handleStop}
                        className="bg-transparent text-xl text-red-300 hover:text-red-200"
                        aria-label="Stop"
                    >
                        ⏹️
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setShowVolume(!showVolume)}
                            className="bg-transparent text-xl text-zinc-100 hover:text-white"
                            aria-label="Volume"
                            title="Volume Control"
                        >
                            {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                        </button>
                        {showVolume && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl flex items-center gap-3 z-50 min-w-[150px]">
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={volume}
                                    onChange={(e) => {
                                        const val = parseFloat(e.target.value);
                                        setVolume(val);
                                        localStorage.setItem('kjdj_volume', val);
                                    }}
                                    className="h-2 flex-1 appearance-none rounded-full bg-zinc-700 accent-emerald-500 cursor-pointer"
                                />
                                <span className="text-xs text-zinc-400 font-mono w-8 text-right">
                                    {Math.round(volume * 100)}%
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="ml-auto min-w-0 text-left">
                    <div className="truncate text-sm font-semibold text-zinc-100">
                        {nowSinger}
                    </div>
                    <div className="truncate text-xs text-zinc-400">
                        {nowSong}
                    </div>
                </div>
            </div>

            <div className="space-y-2 pb-3">
                <input
                    type="range"
                    min="0"
                    max={timeState.duration || 0}
                    value={timeState.current}
                    onChange={(e) => handleSeek(e.target.value)}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800"
                />
                <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>{formatTime(timeState.current)}</span>
                    <span>{formatTime(timeState.duration)}</span>
                </div>
            </div>
            {status === 'error' && <div className="text-sm text-red-400">Error: {errorMsg}</div>}

            <audio
                ref={audioRef}
                src={!isVideoTrack ? mediaSrc : undefined}
                onPlay={handleMediaPlayEvent}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleEnded}
                onLoadedMetadata={handleTimeUpdate}
                className="hidden"
            />
        </div>
    );
}));

export default KaraokePlayer;
