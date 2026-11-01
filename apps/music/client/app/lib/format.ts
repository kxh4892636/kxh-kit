export const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** Today shows the clock; older entries carry the day as well. */
export const formatWhen = (at: number, now: number = Date.now()): string => {
  const date = new Date(at);
  const reference = new Date(now);
  const clock = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === reference.toDateString()
    ? clock
    : `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
};
