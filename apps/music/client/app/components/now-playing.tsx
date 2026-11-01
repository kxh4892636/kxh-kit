import { formatTime } from "../lib/format.ts";

interface NowPlayingProps {
  composer: string;
  work: string;
  movement: string;
  elapsed: number;
  total: number;
}

export const NowPlaying: React.FC<NowPlayingProps> = (props) => {
  const { composer, work, movement, elapsed, total } = props;
  return (
    <>
      <p className="byline">{composer}</p>
      <h1 id="work">{work}</h1>
      <p className="movement">
        <span>{movement || "单乐章"}</span>
        <span className="movement__time num">
          {formatTime(elapsed)} / {formatTime(total)}
        </span>
      </p>
    </>
  );
};
