import type { ReactNode } from "react";

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
  return (
    <section className="graph-workspace-frame" aria-label={`${title} Graphワークスペース`}>
      <header className="graph-workspace-frame__header">
        <div>
          <p className="overline">Graph</p>
          <h2>{title} Graph</h2>
        </div>
        {actions}
      </header>
      {feedback ? <div className="graph-workspace-frame__feedback">{feedback}</div> : null}
      <div className="graph-workspace-frame__body">
        <div className="graph-workspace-frame__canvas">{canvas}</div>
        <aside className="graph-workspace-frame__inspector" aria-label="Graphと統計の設定">
          {inspector}
        </aside>
      </div>
    </section>
  );
}
