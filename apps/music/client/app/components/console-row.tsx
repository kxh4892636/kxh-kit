import { Button } from "./ui/button.tsx";
import { TransportCap } from "./transport-cap.tsx";

interface ConsoleRowProps {
  playing: boolean;
  disabled: boolean;
  onToggle: () => void;
  onNext: () => void;
}

export const ConsoleRow: React.FC<ConsoleRowProps> = (props) => {
  const { playing, disabled, onToggle, onNext } = props;
  return (
    <div className="console">
      <div className="transport">
        <TransportCap playing={playing} disabled={disabled} onToggle={onToggle} />
        <Button variant="outline" onClick={onNext} disabled={disabled}>
          下一首
        </Button>
      </div>
      <p className="console__hint">
        <kbd>空格</kbd> 播放，<kbd>n</kbd> 下一首，洗牌抽取
      </p>
    </div>
  );
};
