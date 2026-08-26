import { useEffect, useRef, useState } from "react";

import { PRODUCT_IDENTITY } from "../app/productIdentity";

export function AboutPanel() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  return (
    <div className="about-menu" ref={menuRef}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        About
      </button>
      {open ? (
        <section className="about-panel" aria-label="About this application">
          <button
            className="about-panel__close"
            type="button"
            aria-label="Aboutを閉じる"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <strong>{PRODUCT_IDENTITY.developmentName}</strong>
          <p>Version {PRODUCT_IDENTITY.version}</p>
          <p>統計engine {PRODUCT_IDENTITY.expectedEngineVersion}</p>
          <p>標準解析とproject dataは、このコンピューター内で処理します。</p>
          <details>
            <summary>Build・ライセンス情報</summary>
            <dl>
              <div>
                <dt>Build revision</dt>
                <dd>{PRODUCT_IDENTITY.buildRevision}</dd>
              </div>
              <div>
                <dt>License</dt>
                <dd>{PRODUCT_IDENTITY.licenseStatus}</dd>
              </div>
            </dl>
          </details>
        </section>
      ) : null}
    </div>
  );
}
