import { useEffect, useRef, useState } from "react";

import { PRODUCT_IDENTITY } from "../app/productIdentity";
import {
  browserRequestsNoTracking,
  copyLocalUsageTelemetryReport,
  setUsageConsent,
  usageTelemetryEventCount,
  usageTelemetryUploadConfigured,
  useUsageConsent,
} from "../app/usageTelemetry";

export function AboutPanel() {
  const [open, setOpen] = useState(false);
  const [usageCopyStatus, setUsageCopyStatus] = useState<string | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const usageConsent = useUsageConsent();
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  useEffect(() => {
    if (open && usageConsent === "opted_in") setUsageCount(usageTelemetryEventCount());
  }, [open, usageConsent]);
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
          <p>標準解析と研究データは、このコンピューター内で処理します。</p>
          <div className="about-usage-setting">
            <div>
              <strong>研究データを含まない利用情報</strong>
              <p>
                測定値、表の内容、実験・条件・試料の名称やID、自由記述、ファイル情報は収集しません。
              </p>
              <p>
                ON時は、ランダムなアプリID、起動ごとのセッションID、操作日時、アプリ・ビルド版、OS種別、入力内容ではなく固定分類された画面領域の操作件数、Graphの種類と初期表示の分類を記録します。
              </p>
            </div>
            <label className="about-usage-toggle">
              <input
                type="checkbox"
                aria-label="研究データを含まない利用情報を収集する"
                checked={usageConsent === "opted_in"}
                onChange={(event) =>
                  setUsageConsent(event.currentTarget.checked ? "opted_in" : "opted_out")
                }
              />
              <span>{usageConsent === "opted_in" ? "ON" : "OFF"}</span>
            </label>
            {usageConsent === "opted_in" && !usageTelemetryUploadConfigured() ? (
              <p className="about-usage-note">
                このビルドには送信先が設定されていないため、外部への送信は行われません。
              </p>
            ) : null}
            {usageConsent === "opted_in" && usageTelemetryUploadConfigured() ? (
              <p className="about-usage-note">
                送信時には、通信に伴うIPアドレスなどの通信情報が送信先で扱われる可能性があります。
              </p>
            ) : null}
            {usageConsent === "opted_in" && browserRequestsNoTracking() ? (
              <p className="about-usage-note">
                追跡拒否設定より、この画面での明示的なONを優先しています。
              </p>
            ) : null}
            <p className="about-usage-note">
              OFFにすると収集を停止し、端末内の未送信情報とランダムなアプリIDを削除します。
            </p>
            {usageConsent === "opted_in" ? (
              <div className="about-usage-export">
                <span>未送信・ローカル集計：{usageCount}件</span>
                <button
                  type="button"
                  onClick={() => {
                    setUsageCopyStatus(null);
                    void copyLocalUsageTelemetryReport()
                      .then(() => {
                        setUsageCount(usageTelemetryEventCount());
                        setUsageCopyStatus("利用情報のローカルレポートをコピーしました。");
                      })
                      .catch(() =>
                        setUsageCopyStatus(
                          "コピーできませんでした。clipboard権限を確認してください。",
                        ),
                      );
                  }}
                >
                  利用情報レポートをコピー
                </button>
                {usageCopyStatus ? <span role="status">{usageCopyStatus}</span> : null}
              </div>
            ) : null}
          </div>
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
