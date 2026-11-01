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
  ink: document.getElementById("ink"),
  wave: document.querySelector(".wave"),
  passed: document.getElementById("passed"),
  head: document.getElementById("head"),
  index: document.getElementById("index"),
  indexBody: document.getElementById("index-body"),
  loading: document.getElementById("state-loading"),
  error: document.getElementById("state-error"),
  retry: document.getElementById("retry"),
  historyList: document.getElementById("history-list"),
  historyEmpty: document.getElementById("state-empty"),
  announcer: document.getElementById("announcer"),
  note: document.getElementById("library-note"),
};

const state = { data: null, bag: [], current: null, history: [] };

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
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

const trackLabel = (track) => [track.work, track.movement].filter(Boolean).join("，");

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

const paintProgress = () => {
  const total = el.audio.duration || state.current?.seconds || 0;
  const ratio = total > 0 ? Math.min(el.audio.currentTime / total, 1) : 0;
  el.wave.style.setProperty("--p", ratio.toFixed(4));
  el.passed.style.setProperty("--p", ratio.toFixed(4));
  el.head.style.setProperty("--p", ratio.toFixed(4));
  el.time.textContent = `${formatTime(el.audio.currentTime)} / ${formatTime(total)}`;
};

const markCurrentRows = () => {
  for (const row of el.indexBody.querySelectorAll("tr")) {
    row.classList.toggle("is-current", row.dataset.id === state.current?.id);
  }
  for (const item of el.historyList.querySelectorAll("li")) {
    item.classList.toggle("is-current", item.dataset.id === state.current?.id);
  }
};

const showTrack = (track) => {
  el.composer.textContent = track.composer;
  el.work.textContent = track.work;
  el.movement.textContent = track.movement || "单乐章";
  el.wave.style.setProperty("--wave-src", `url("${track.mask}")`);
  el.time.textContent = `0:00 / ${formatTime(track.seconds)}`;
  el.wave.setAttribute("aria-label", `${track.composer}，${trackLabel(track)}`);
  el.announcer.textContent = `正在播放 ${trackLabel(track)}，${track.composer}`;
  markCurrentRows();
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

const renderHistory = () => {
  el.historyList.replaceChildren();
  el.historyEmpty.hidden = state.history.length > 0;
  for (const entry of state.history) {
    const track = byId(entry.id);
    if (!track) continue;
    const item = document.createElement("li");
    item.className = "history__item";
    item.dataset.id = track.id;
    if (track.id === state.current?.id) item.classList.add("is-current");

    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", () => {
      void playTrack(track.id);
    });

    const when = document.createElement("span");
    when.className = "history__when num";
    when.textContent = new Date(entry.at).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });

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
  markCurrentRows();
};

const renderIndex = () => {
  el.indexBody.replaceChildren();
  for (const track of state.data.tracks) {
    const row = document.createElement("tr");
    row.dataset.id = track.id;

    const work = document.createElement("td");
    work.className = "index__work";
    work.textContent = track.work;

    const movement = document.createElement("td");
    movement.textContent = track.movement || "单乐章";

    const composer = document.createElement("td");
    composer.textContent = track.composer;

    const length = document.createElement("td");
    length.className = "index__num num";
    length.textContent = formatTime(track.seconds);

    const action = document.createElement("td");
    const play = document.createElement("button");
    play.type = "button";
    play.className = "index__play";
    play.textContent = "播放";
    play.setAttribute("aria-label", `播放 ${trackLabel(track)}`);
    play.addEventListener("click", () => {
      void playTrack(track.id);
    });
    action.append(play);

    row.append(work, movement, composer, length, action);
    el.indexBody.append(row);
  }
  markCurrentRows();
};

const playTrack = async (id, { autoplay = true } = {}) => {
  const track = byId(id);
  if (!track) return;
  state.current = track;
  el.audio.src = track.audio;
  el.audio.load();
  showTrack(track);
  paintProgress();
  if (autoplay) {
    try {
      await el.audio.play();
    } catch {
      setPlaying(false);
    }
  }
};

const next = () => {
  if (!state.data) return;
  if (state.bag.length === 0) refillBag();
  const id = state.bag.shift();
  void playTrack(id);
};

const toggle = () => {
  if (!state.current) {
    next();
    return;
  }
  if (el.audio.paused) {
    void el.audio.play().catch(() => setPlaying(false));
  } else {
    el.audio.pause();
  }
};

el.play.addEventListener("click", toggle);
el.next.addEventListener("click", next);

document.addEventListener("keydown", (event) => {
  const tag = event.target instanceof HTMLElement ? event.target.tagName : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || event.metaKey || event.ctrlKey) return;
  if (event.code === "Space") {
    event.preventDefault();
    toggle();
  }
  if (event.key === "n" || event.key === "N") {
    event.preventDefault();
    next();
  }
});

el.audio.addEventListener("playing", () => {
  setPlaying(true);
  if (state.current) pushHistory(state.current.id);
});
el.audio.addEventListener("pause", () => setPlaying(false));
el.audio.addEventListener("timeupdate", paintProgress);
el.audio.addEventListener("ended", next);
el.audio.addEventListener("error", () => {
  setPlaying(false);
  el.announcer.textContent = "这段音频没能打开，可以按下一首换一首";
});

const load = async () => {
  el.loading.hidden = false;
  el.error.hidden = true;
  el.index.hidden = true;
  try {
    const response = await fetch("library.json", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    state.data = await response.json();
    state.history = readHistory();
    el.loading.hidden = true;
    el.index.hidden = false;
    el.note.textContent = `样张 ${state.data.excerpt} 首，正式曲库 ${state.data.library.tracks} 首 / ${state.data.library.works} 部作品。`;
    renderIndex();
    renderHistory();
    refillBag();
  } catch {
    el.loading.hidden = true;
    el.error.hidden = false;
  }
};

el.retry.addEventListener("click", () => {
  void load();
});

void load();
