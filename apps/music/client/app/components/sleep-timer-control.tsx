import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  formatRemaining,
  parseMinutes,
  remainingMinutes,
  remainingMs,
  type SleepTimer,
} from "../playback/sleep-timer.ts";
import "./sleep-timer-control.css";

interface SleepTimerControlProps {
  timer: SleepTimer;
  disabled: boolean;
  onCountdown: (minutes: number) => void;
  onEndless: () => void;
  onExpire: () => void;
}

const QUICK_MINUTES = [5, 10, 15, 30] as const;

/**
 * Replaces the auto-play switch. Idle it is one quiet「定时」button; once a
 * timer runs it is a readout that cannot be paused or cancelled (`role="timer"`,
 * no control), which is why it is not a disabled button.
 */
export const SleepTimerControl: React.FC<SleepTimerControlProps> = (props) => {
  const { timer, disabled, onCountdown, onEndless, onExpire } = props;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("30");
  const [invalid, setInvalid] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const hintId = useId();
  const panelId = useId();

  const running = timer.kind === "until";

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running, timer]);

  useEffect(() => {
    if (timer.kind === "until" && Date.now() >= timer.endsAt) onExpire();
  }, [now, onExpire, timer]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      const wrapper = wrapperRef.current;
      if (wrapper && !wrapper.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const submit = useCallback(
    (event: React.FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      const minutes = parseMinutes(draft);
      if (minutes === null) {
        setInvalid(true);
        inputRef.current?.focus();
        return;
      }
      setInvalid(false);
      setOpen(false);
      onCountdown(minutes);
    },
    [draft, onCountdown],
  );

  if (timer.kind === "endless") {
    return (
      <div className="timer timer--endless">
        <div className="timer__readout" role="timer" aria-label="自动播放不限时">
          <span className="timer__count">不限时</span>
        </div>
      </div>
    );
  }

  if (timer.kind === "until") {
    const left = remainingMs(timer, now) ?? 0;
    const ratio = timer.totalMs > 0 ? Math.min(1, Math.max(0, left / timer.totalMs)) : 0;
    const minutesLeft = remainingMinutes(timer, now) ?? 0;
    return (
      <div className="timer" ref={wrapperRef}>
        <div
          className="timer__readout"
          role="timer"
          aria-label={`自动播放剩余 ${minutesLeft} 分钟，到期后本轮播完停止`}
        >
          <span className="timer__count" aria-hidden="true">
            {formatRemaining(left)}
          </span>
          <span className="timer__rail" aria-hidden="true">
            <span
              className="timer__rail-fill"
              style={{ "--remain": ratio } as React.CSSProperties}
            />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="timer" ref={wrapperRef}>
      <button
        type="button"
        className="timer__trigger"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        定时
      </button>
      {open ? (
        <div className="timer__panel" id={panelId} role="group" aria-label="自动播放倒计时">
          <form className="timer__form" onSubmit={submit} noValidate>
            <label className="timer__label" htmlFor={inputId}>
              自动播放分钟数
            </label>
            <div className="timer__field">
              <input
                className="timer__input"
                id={inputId}
                ref={inputRef}
                type="number"
                inputMode="numeric"
                min={1}
                max={1440}
                step={1}
                value={draft}
                aria-invalid={invalid}
                aria-describedby={hintId}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setInvalid(false);
                }}
              />
              <span className="timer__unit">分钟</span>
            </div>
            <p className="timer__hint" id={hintId} data-state={invalid ? "error" : undefined}>
              {invalid ? "只能是 1 到 1440 之间的整数。" : "到期后，本轮播完就停。"}
            </p>
            <div className="timer__quick">
              {QUICK_MINUTES.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  className="timer__chip"
                  aria-label={`设为 ${minutes} 分钟`}
                  onClick={() => {
                    setDraft(String(minutes));
                    setInvalid(false);
                  }}
                >
                  {minutes}
                </button>
              ))}
            </div>
            <div className="timer__actions">
              <button className="timer__start" type="submit">
                开始计时
              </button>
              <button
                className="timer__endless"
                type="button"
                onClick={() => {
                  setOpen(false);
                  onEndless();
                }}
              >
                不限时
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};
