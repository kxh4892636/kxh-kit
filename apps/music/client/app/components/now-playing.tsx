import type { Track } from "../../../shared/tracks.ts";
import { formatTime } from "../lib/format.ts";

interface NowPlayingProps {
  track: Track;
  elapsed: number;
  total: number;
}

const movementLabel = (track: Track): string =>
  track.movementZh || (track.kind === "excerpt" ? "选段" : "单乐章");

/**
 * Chinese is the reading layer; the original titles stay in the title attribute
 * (and in the index) so a listener can still search or cross-check them.
 */
export const NowPlaying: React.FC<NowPlayingProps> = (props) => {
  const { track, elapsed, total } = props;
  const original = [track.workOriginal, track.catalog].filter(Boolean).join("，");
  const heading = track.catalog ? track.workZh + " " + track.catalog : track.workZh;
  return (
    <>
      <p className="byline" title={track.composer}>
        {track.composerZh}
      </p>
      <h1 id="work" title={original || track.work}>
        {heading}
      </h1>
      <p className="movement">
        <span title={track.movement || undefined}>{movementLabel(track)}</span>
        <span className="movement__time num">
          {formatTime(elapsed)} / {formatTime(total)}
        </span>
      </p>
    </>
  );
};
