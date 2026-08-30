export type ProjectTab = Readonly<{
  target: string;
  name: string;
  kind: "experiment" | "unresolved_visualization" | "specialized_entry_draft";
  dirty?: boolean;
}>;

type Props = Readonly<{
  tabs: readonly ProjectTab[];
  activeTarget: string | null;
  activeDirty: boolean;
  onSelect: (target: string) => void;
  onClose: (target: string) => void;
  onOpen: () => void;
}>;

/** Project tabs may retain a validated in-memory checkpoint until the user saves or closes them. */
export function ProjectTabBar({
  tabs,
  activeTarget,
  activeDirty,
  onSelect,
  onClose,
  onOpen,
}: Props) {
  const ja = useAppLocale() === "ja";
  if (tabs.length === 0) return null;

  return (
    <nav className="project-tabs" aria-label={ja ? "開いているプロジェクト" : "Open projects"}>
      <div className="project-tabs__list" role="tablist" aria-label={ja ? "プロジェクト" : "Projects"}>
        {tabs.map((tab) => {
          const active = tab.target === activeTarget;
          return (
            <div className={`project-tab${active ? " is-active" : ""}`} key={tab.target}>
              <button
                className="project-tab__select"
                type="button"
                role="tab"
                aria-selected={active}
                title={tab.target}
                onClick={() => onSelect(tab.target)}
              >
                <span className="project-tab__name">{tab.name}</span>
                {(active ? activeDirty : tab.dirty) ? (
                  <span className="project-tab__dirty" aria-label={ja ? "未保存の変更あり" : "Unsaved changes"}>
                    ●
                  </span>
                ) : null}
              </button>
              <button
                className="project-tab__close"
                type="button"
                aria-label={ja ? `${tab.name}を閉じる` : `Close ${tab.name}`}
                onClick={() => onClose(tab.target)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button className="project-tabs__open" type="button" onClick={onOpen}>
        {ja ? "＋ 開く" : "+ Open"}
      </button>
    </nav>
  );
}
import { useAppLocale } from "../app/appLocale";
