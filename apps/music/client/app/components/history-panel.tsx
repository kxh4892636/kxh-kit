import { formatClock, groupByDay } from "../lib/format.ts";

export interface HistoryView {
  id: string;
  at: number;
  label: string;
  composer: string;
}

interface HistoryPanelProps {
  entries: readonly HistoryView[];
  currentId: string | null;
  max: number;
  onPlay: (id: string) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = (props) => {
  const { entries, currentId, max, onPlay } = props;
  const groups = groupByDay(entries);

  return (
    <aside className="history" aria-labelledby="history-head">
      <h2 id="history-head">最近听过</h2>
      <p className="history__note">最多留 {max} 首，刷新也在。</p>
      <div className="history__scroll">
        {groups.length === 0 ? (
          <p className="state">还没有听过。按下播放，这里会记下刚才的曲目。</p>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="history__group">
              <h3 className="history__day">{group.label}</h3>
              <ol className="history__list">
                {group.items.map((entry) => (
                  <li
                    key={entry.id}
                    className={
                      entry.id === currentId ? "history__item is-current" : "history__item"
                    }
                  >
                    <button type="button" onClick={() => onPlay(entry.id)}>
                      <span className="history__when num">{formatClock(entry.at)}</span>
                      <span className="history__what">{entry.label}</span>
                      <span className="history__who">{entry.composer}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
    </aside>
  );
};
