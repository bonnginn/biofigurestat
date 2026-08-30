import { useState, type ReactNode } from "react";

import "./graph-workspace-frame.css";

export function GraphWorkspaceFrame({
  title,
  actions,
  canvas,
  inspector,
  feedback,
}: Readonly<{
  title: string;
  actions: ReactNode;
  canvas: ReactNode;
  inspector: ReactNode;
  feedback?: ReactNode;
}>) {
  const [wideCanvas, setWideCanvas] = useState(false);
  const workspaceTitle = /graph$/iu.test(title.trim()) ? title.trim() : `${title.trim()} Graph`;

  return (
    <section className="graph-workspace-frame" aria-label={`${workspaceTitle}ワークスペース`}>
      <header className="graph-workspace-frame__header">
        <div>
          <p className="overline">Graph</p>
          <h2>{workspaceTitle}</h2>
        </div>
        <div className="graph-workspace-frame__header-actions">
          {actions}
          <button
            type="button"
            className="graph-workspace-frame__layout-toggle"
            aria-pressed={wideCanvas}
            onClick={() => setWideCanvas((current) => !current)}
          >
            {wideCanvas ? "Graphと設定を横並び" : "Graphを全幅表示"}
          </button>
        </div>
      </header>
      {feedback ? <div className="graph-workspace-frame__feedback">{feedback}</div> : null}
      <div
        className="graph-workspace-frame__body"
        data-layout={wideCanvas ? "wide-canvas" : "side-by-side"}
      >
        <div className="graph-workspace-frame__canvas">{canvas}</div>
        <aside className="graph-workspace-frame__inspector" aria-label="Graphと統計の設定">
          {inspector}
        </aside>
      </div>
    </section>
  );
}
