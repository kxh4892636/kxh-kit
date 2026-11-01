const HISTORY_KEY = "musopen.listen.history.v1";
const HISTORY_MAX = 13;

const el = {
  audio: document.getElementById("audio"),
  play: document.getElementById("play"),
  playLabel: document.getElementById("playlabel"),
  next: document.getElementById("next"),
  composer: document.getElementById("composer"),
  work: document.getElementById("work"),
  movement: document.getElementById("movement"),
  time: document.getElementById("time"),
  wave: document.querySelector(".wave"),
  loading: document.getElementById("state-loading"),
  error: document.getElementById("state-error"),
  retry: document.getElementById("retry"),
  audioError: document.getElementById("audio-error"),
  historyList: document.getElementById("history-list"),
  historyEmpty: document.getElementById("state-empty"),
  announcer: document.getElementById("announcer"),
  note: document.getElementById("library-note"),
};

const state = {
  data: null,
  bag: [],
  current: null,
  pending: null,
  history: [],
  dragging: false,
};

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

const formatWhen = (at) => {
  const date = new Date(at);
  const now = new Date();
  const clock = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === now.toDateString()
    ? clock
    : `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
};

const shuffle = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const readHistory = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
};

const saveHistory = () => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  } catch {
    /* storage blocked; the session still works */
  }
};

const byId = (id) => state.data?.tracks.find((track) => track.id === id) ?? null;

const trackLabel = (track) => [track.work, track.movement || "单乐章"].join("，");

const refillBag = () => {
  const ids = shuffle((state.data?.tracks ?? []).map((track) => track.id));
  if (ids.length > 1 && ids[0] === state.current?.id) {
    [ids[0], ids[1]] = [ids[1], ids[0]];
  }
  state.bag = ids;
};

const setPlaying = (playing) => {
  el.play.setAttribute("aria-pressed", String(playing));
  el.playLabel.textContent = playing ? "暂停" : "播放";
};

const setTransportEnabled = (enabled) => {
  el.play.disabled = !enabled;
  el.next.disabled = !enabled;
};

const paintProgress = () => {
  const total = el.audio.duration || state.current?.seconds || 0;
  const ratio = total > 0 ? Math.min(el.audio.currentTime / total, 1) : 0;
  const now = el.audio.currentTime || 0;
  el.wave.style.setProperty("--p", ratio.toFixed(4));
  el.time.textContent = `${formatTime(now)} / ${formatTime(total)}`;
  el.wave.setAttribute("aria-valuemax", String(Math.round(total)));
  el.wave.setAttribute("aria-valuenow", String(Math.round(now)));
  el.wave.setAttribute("aria-valuetext", `${formatTime(now)} / ${formatTime(total)}`);
};

const markHistoryCurrent = () => {
  for (const item of el.historyList.querySelectorAll("li")) {
    item.classList.toggle("is-current", item.dataset.id === state.current?.id);
  }
};

const renderHistory = () => {
  el.historyList.replaceChildren();
  el.historyEmpty.hidden = state.history.length > 0;
  for (const entry of state.history) {
    const track = byId(entry.id);
    if (!track) continue;
    const item = document.createElement("li");
    item.className = "history__item";
    item.dataset.id = track.id;

    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", () => {
      select(track.id);
      void play();
    });

    const when = document.createElement("span");
    when.className = "history__when num";
    when.textContent = formatWhen(entry.at);

    const what = document.createElement("span");
    what.className = "history__what";
    what.textContent = trackLabel(track);

    const who = document.createElement("span");
    who.className = "history__who";
    who.textContent = track.composer;

    button.append(when, what, who);
    item.append(button);
    el.historyList.append(item);
  }
  markHistoryCurrent();
};

const pushHistory = (id) => {
  const track = byId(id);
  if (!track) return;
  state.history = state.history.filter((entry) => entry.id !== id);
  state.history.unshift({ id, at: Date.now() });
  state.history = state.history.slice(0, HISTORY_MAX);
  saveHistory();
  renderHistory();
};

const select = (id) => {
  const track = byId(id);
  if (!track) return;
  state.current = track;
  state.pending = id;
  el.audio.src = track.audio;
  el.audio.load();
  el.composer.textContent = track.composer;
  el.work.textContent = track.work;
  el.movement.textContent = track.movement || "单乐章";
  el.time.textContent = `0:00 / ${formatTime(track.seconds)}`;
  el.wave.style.setProperty("--wave-src", `url("${track.mask}")`);
  el.wave.setAttribute("aria-label", `${track.composer}，${trackLabel(track)}，可拖动调整进度`);
  el.audioError.hidden = true;
  markHistoryCurrent();
  paintProgress();
};

const play = async () => {
  if (!state.current) return;
  try {
    await el.audio.play();
  } catch {
    setPlaying(false);
  }
};

const startNext = async () => {
  if (!state.data) return;
  if (state.bag.length === 0) refillBag();
  select(state.bag.shift());
  await play();
};

const toggle = () => {
  if (!state.current) return;
  if (el.audio.paused) void play();
  else el.audio.pause();
};

const seekToRatio = (ratio) => {
  const total = el.audio.duration;
  if (!Number.isFinite(total) || total <= 0) return;
  el.audio.currentTime = Math.min(Math.max(ratio, 0), 1) * total;
  paintProgress();
};

const ratioFromEvent = (event) => {
  const rect = el.wave.getBoundingClientRect();
  return rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
};

el.play.addEventListener("click", toggle);
el.next.addEventListener("click", () => {
  void startNext();
});

el.wave.addEventListener("pointerdown", (event) => {
  seekToRatio(ratioFromEvent(event));
  state.dragging = true;
  try {
    el.wave.setPointerCapture(event.pointerId);
  } catch {
    /* capture is a nicety; seeking already happened */
  }
});
el.wave.addEventListener("pointermove", (event) => {
  if (!state.dragging) return;
  seekToRatio(ratioFromEvent(event));
});
el.wave.addEventListener("pointerup", (event) => {
  state.dragging = false;
  try {
    el.wave.releasePointerCapture(event.pointerId);
  } catch {
    /* nothing captured */
  }
});
el.wave.addEventListener("pointercancel", () => {
  state.dragging = false;
});
el.wave.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const step = event.key === "ArrowRight" ? 5 : -5;
  el.audio.currentTime = Math.max(0, Math.min(el.audio.duration || 0, el.audio.currentTime + step));
  paintProgress();
});

document.addEventListener("keydown", (event) => {
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
    toggle();
  }
  if (event.key === "n" || event.key === "N") {
    event.preventDefault();
    void startNext();
  }
});

el.audio.addEventListener("playing", () => {
  setPlaying(true);
  if (!state.current) return;
  pushHistory(state.current.id);
  if (state.pending === state.current.id) {
    state.bag = state.bag.filter((id) => id !== state.current.id);
    state.pending = null;
  }
});
el.audio.addEventListener("pause", () => setPlaying(false));
el.audio.addEventListener("timeupdate", paintProgress);
el.audio.addEventListener("ended", () => {
  void startNext();
});
el.audio.addEventListener("error", () => {
  setPlaying(false);
  if (!el.audio.getAttribute("src")) return;
  el.audioError.hidden = false;
});

const load = async () => {
  setTransportEnabled(false);
  el.loading.hidden = false;
  el.error.hidden = true;
  el.audioError.hidden = true;
  try {
    const response = await fetch("library.json", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    state.data = await response.json();
    state.history = readHistory();
    el.loading.hidden = true;
    el.note.textContent = `试听样张 ${state.data.excerpt} 首，正式曲库 ${state.data.library.tracks} 首 / ${state.data.library.works} 部作品。`;
    renderHistory();
    refillBag();
    select(state.bag[0]);
    setTransportEnabled(true);
  } catch {
    el.loading.hidden = true;
    el.error.hidden = false;
  }
};

el.retry.addEventListener("click", () => {
  void load();
});

void load();
