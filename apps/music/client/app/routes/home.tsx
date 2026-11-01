import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { fetchLibrary } from "../api/tracks.ts";
import { ConsoleRow } from "../components/console-row.tsx";
import { HistoryPanel, type HistoryView } from "../components/history-panel.tsx";
import { NowPlaying } from "../components/now-playing.tsx";
import { StateLine } from "../components/state-line.tsx";
import { Button } from "../components/ui/button.tsx";
import { WaveSeek } from "../components/wave-seek.tsx";
import { appUrl } from "../lib/url.ts";
import { usePlayback } from "../playback/use-playback.ts";
import { HISTORY_MAX } from "../store/history.ts";
import { usePlayerStore } from "../store/player.ts";
import type { Track } from "../../../shared/tracks.ts";

const labelOf = (track: Track): string => [track.work, track.movement || "单乐章"].join("，");

export const HomeRoute: React.FC = () => {
  const query = useQuery({
    queryKey: ["library"],
    queryFn: ({ signal }) => fetchLibrary(signal),
  });

  const tracks = query.data?.tracks;
  const currentId = usePlayerStore((state) => state.currentId);
  const history = usePlayerStore((state) => state.history);
  const current = useMemo(
    () => tracks?.find((track) => track.id === currentId) ?? null,
    [tracks, currentId],
  );

  const playback = usePlayback(tracks, current);

  const byId = useMemo(() => new Map((tracks ?? []).map((track) => [track.id, track])), [tracks]);

  const entries: HistoryView[] = history.flatMap((entry) => {
    const track = byId.get(entry.id);
    if (!track) return [];
    return [{ id: track.id, at: entry.at, label: labelOf(track), composer: track.composer }];
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button, a, input, textarea, [role='slider']")
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey) return;
      if (event.code === "Space") {
        event.preventDefault();
        playback.toggle();
      }
      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        playback.next();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playback]);

  const ready = Boolean(current);
  const progress = playback.total > 0 ? Math.min(playback.elapsed / playback.total, 1) : 0;
  const library = query.data;

  return (
    <>
      <main className="stage">
        <section className="now" aria-labelledby="work">
          {current ? (
            <>
              <NowPlaying
                composer={current.composer}
                work={current.work}
                movement={current.movement}
                elapsed={playback.elapsed}
                total={playback.total}
              />
              <WaveSeek
                mask={current.mask ? appUrl(current.mask) : null}
                label={`${current.composer}，${labelOf(current)}，可拖动调整进度`}
                progress={progress}
                valueNow={playback.elapsed}
                valueMax={playback.total}
                onSeek={playback.seekTo}
                onSeekBy={playback.seekBy}
              />
              <ConsoleRow
                playing={playback.playing}
                disabled={!ready}
                onToggle={playback.toggle}
                onNext={playback.next}
              />
              {playback.failed ? (
                <StateLine>这段音频打不开，文件可能不在本机。按「下一首」换一首。</StateLine>
              ) : null}
            </>
          ) : null}
          {query.isLoading ? <StateLine>正在读取曲目…</StateLine> : null}
          {query.isError ? (
            <StateLine>
              曲目没能读出来。
              <Button variant="outline" size="compact" onClick={() => void query.refetch()}>
                重试
              </Button>
            </StateLine>
          ) : null}
        </section>

        <HistoryPanel
          entries={entries}
          currentId={currentId}
          max={HISTORY_MAX}
          onPlay={playback.playTrack}
        />
      </main>

      <footer className="foot">
        <p>
          录音来自{" "}
          <a href={library?.source ?? "https://archive.org/details/MusopenCollectionAsFlac"}>
            Internet Archive · Musopen
          </a>
          ，{library?.license ?? "CC PD Mark 1.0"}。
          {library ? (
            <span>
              曲库 {library.library.tracks} 首 / {library.library.works} 部作品。
            </span>
          ) : null}
        </p>
        <p>本地播放，不联网取音频。</p>
      </footer>
    </>
  );
};
