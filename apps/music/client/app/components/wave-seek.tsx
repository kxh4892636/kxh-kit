import { useRef, type CSSProperties, type PointerEvent } from "react";

interface WaveSeekProps {
  mask: string | null;
  label: string;
  progress: number;
  valueNow: number;
  valueMax: number;
  onSeek: (ratio: number) => void;
  onSeekBy: (delta: number) => void;
}

/**
 * The waveform is the seek bar: pointer down jumps, dragging scrubs, arrow keys
 * nudge by five seconds. `--p` drives both the passed tint and the playhead.
 */
export const WaveSeek: React.FC<WaveSeekProps> = (props) => {
  const { mask, label, progress, valueNow, valueMax, onSeek, onSeekBy } = props;
  const figureRef = useRef<HTMLElement | null>(null);
  const draggingRef = useRef(false);

  const ratioFrom = (clientX: number): number => {
    const rect = figureRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return (clientX - rect.left) / rect.width;
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>): void => {
    onSeek(ratioFrom(event.clientX));
    draggingRef.current = true;
    try {
      figureRef.current?.setPointerCapture(event.pointerId);
    } catch {
      /* capture is a nicety; the jump already happened */
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>): void => {
    if (!draggingRef.current) return;
    onSeek(ratioFrom(event.clientX));
  };

  const endDrag = (event: PointerEvent<HTMLElement>): void => {
    draggingRef.current = false;
    try {
      figureRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      /* nothing captured */
    }
  };

  const style = {
    "--wave-src": mask ? `url("${mask}")` : "none",
    "--p": progress,
  } as CSSProperties;

  return (
    <figure
      ref={(node) => {
        figureRef.current = node;
      }}
      className="wave"
      style={style}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(valueMax)}
      aria-valuenow={Math.round(valueNow)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        onSeekBy(event.key === "ArrowRight" ? 5 : -5);
      }}
    >
      <span className="wave__ink" aria-hidden="true" />
      <span className="wave__passed" aria-hidden="true" />
      <span className="wave__head" aria-hidden="true" />
    </figure>
  );
};
