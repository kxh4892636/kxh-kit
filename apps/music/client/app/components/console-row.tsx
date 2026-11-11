import type { SleepTimer } from "../playback/sleep-timer.ts";
import { Button } from "./ui/button.tsx";
import { SleepTimerControl } from "./sleep-timer-control.tsx";
import { TransportCap } from "./transport-cap.tsx";

interface ConsoleRowProps {
  playing: boolean;
  disabled: boolean;
  timer: SleepTimer;
  onToggle: () => void;
  onNext: () => void;
  onCountdown: (minutes: number) => void;
  onEndless: () => void;
  onExpire: () => void;
}

export const ConsoleRow: React.FC<ConsoleRowProps> = (props) => {
  const { playing, disabled, timer, onToggle, onNext, onCountdown, onEndless, onExpire } = props;
  return (
    <div className="console">
      <div className="transport">
        <TransportCap playing={playing} disabled={disabled} onToggle={onToggle} />
        <Button variant="outline" onClick={onNext} disabled={disabled}>
          下一首
        </Button>
        <SleepTimerControl
          timer={timer}
          disabled={disabled}
          onCountdown={onCountdown}
          onEndless={onEndless}
          onExpire={onExpire}
        />
      </div>
      <p className="console__hint">
        <kbd>空格</kbd> 播放，<kbd>n</kbd> 下一首，洗牌抽取
      </p>
    </div>
  );
};
