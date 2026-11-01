interface TransportCapProps {
  playing: boolean;
  disabled: boolean;
  onToggle: () => void;
}

export const TransportCap: React.FC<TransportCapProps> = (props) => {
  const { playing, disabled, onToggle } = props;
  return (
    <button
      className="cap"
      type="button"
      aria-pressed={playing}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="cap__well" aria-hidden="true">
        <span className="cap__rubber" />
      </span>
      <span className="cap__label">{playing ? "暂停" : "播放"}</span>
    </button>
  );
};
