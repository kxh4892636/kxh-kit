import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../../../shared/tracks.ts";
import { usePlayerStore } from "../store/player.ts";

export interface Playback {
  playing: boolean;
  elapsed: number;
  total: number;
  toggle: () => void;
  next: () => void;
  seekTo: (ratio: number) => void;
  seekBy: (delta: number) => void;
  playTrack: (id: string) => void;
  failed: boolean;
}

interface AudioHandlers {
  onPlaying: () => void;
  onPause: () => void;
  onTime: () => void;
  onEnded: () => void;
  onError: () => void;
}

const attachAudio = (audio: HTMLAudioElement, handlers: AudioHandlers): (() => void) => {
  const playing = (): void => handlers.onPlaying();
  const pause = (): void => handlers.onPause();
  const time = (): void => handlers.onTime();
  const ended = (): void => handlers.onEnded();
  const failed = (): void => handlers.onError();
  audio.addEventListener("playing", playing);
  audio.addEventListener("pause", pause);
  audio.addEventListener("timeupdate", time);
  audio.addEventListener("ended", ended);
  audio.addEventListener("error", failed);
  return (): void => {
    audio.removeEventListener("playing", playing);
    audio.removeEventListener("pause", pause);
    audio.removeEventListener("timeupdate", time);
    audio.removeEventListener("ended", ended);
    audio.removeEventListener("error", failed);
  };
};

/**
 * One audio element for the whole screen. The store owns which track is
 * current (and therefore which URL loads); this hook owns the element, the
 * progress reading and the autoplay that follows a manual「下一首」.
 */
export const usePlayback = (
  tracks: readonly Track[] | undefined,
  current: Track | null,
): Playback => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null) audioRef.current = new Audio();
  const audio = audioRef.current;

  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [failed, setFailed] = useState(false);
  const shouldPlayRef = useRef(false);

  const ids = useMemo(() => (tracks ?? []).map((track) => track.id), [tracks]);
  const start = usePlayerStore((state) => state.start);
  const advance = usePlayerStore((state) => state.advance);
  const commitPlayed = usePlayerStore((state) => state.commitPlayed);
  const select = usePlayerStore((state) => state.select);

  useEffect(() => {
    if (ids.length > 0) start(ids);
  }, [ids, start]);

  useEffect(() => {
    if (!current) return;
    audio.src = current.audio;
    audio.load();
    setElapsed(0);
    setFailed(false);
    if (shouldPlayRef.current) {
      shouldPlayRef.current = false;
      void audio.play().catch(() => setPlaying(false));
    }
  }, [audio, current]);

  useEffect(
    () =>
      attachAudio(audio, {
        onPlaying: () => {
          setPlaying(true);
          if (current) commitPlayed(current.id);
        },
        onPause: () => setPlaying(false),
        onTime: () => setElapsed(audio.currentTime),
        onError: () => {
          setPlaying(false);
          setFailed(true);
        },
        onEnded: () => {
          shouldPlayRef.current = true;
          advance(ids);
        },
      }),
    [audio, advance, commitPlayed, current, ids],
  );

  useEffect(() => {
    audio.hidden = true;
    audio.preload = "metadata";
    document.body.appendChild(audio);
    return () => {
      audio.pause();
      audio.remove();
    };
  }, [audio]);

  const next = useCallback((): void => {
    shouldPlayRef.current = true;
    advance(ids);
  }, [advance, ids]);

  const toggle = useCallback((): void => {
    if (!current) {
      next();
      return;
    }
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [audio, current, next]);

  const seekTo = useCallback(
    (ratio: number): void => {
      const duration = audio.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      audio.currentTime = Math.min(Math.max(ratio, 0), 1) * duration;
      setElapsed(audio.currentTime);
    },
    [audio],
  );

  const seekBy = useCallback(
    (delta: number): void => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + delta));
      setElapsed(audio.currentTime);
    },
    [audio],
  );

  const total =
    Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : (current?.seconds ?? 0);

  const playTrack = useCallback(
    (id: string): void => {
      shouldPlayRef.current = true;
      select(id);
    },
    [select],
  );

  return { playing, elapsed, total, toggle, next, seekTo, seekBy, playTrack, failed };
};
