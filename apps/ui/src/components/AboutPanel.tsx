import { useEffect, useRef, useState } from "react";

import { PRODUCT_IDENTITY } from "../app/productIdentity";
import {
  browserRequestsNoTracking,
  copyLocalUsageTelemetryReport,
  setUsageConsent,
  usageTelemetryEventCount,
  usageTelemetryPrivacyContact,
  usageTelemetryUploadConfigured,
  useUsageConsent,
} from "../app/usageTelemetry";
import { useAppLocale } from "../app/appLocale";

export function AboutPanel() {
  const ja = useAppLocale() === "ja";
  const [open, setOpen] = useState(false);
  const [usageCopyStatus, setUsageCopyStatus] = useState<string | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const usageConsent = useUsageConsent();
  const privacyContact = usageTelemetryPrivacyContact();
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
            aria-label={ja ? "Aboutを閉じる" : "Close About"}
            onClick={() => setOpen(false)}
          >
            ×
          </button>
          <strong>{PRODUCT_IDENTITY.developmentName}</strong>
          <p>Version {PRODUCT_IDENTITY.version}</p>
          <p>
            {ja ? "統計engine" : "Statistical engine"} {PRODUCT_IDENTITY.expectedEngineVersion}
          </p>
          <p>
            {ja
              ? "標準解析と研究データは、このコンピューター内で処理します。"
              : "Standard analyses and research data are processed on this computer."}
          </p>
          <div className="about-usage-setting">
            <div>
              <strong>{ja ? "研究データを含まない利用情報" : "Usage data without research data"}</strong>
              <p>
                {ja
                  ? "測定値、表の内容、実験・条件・試料の名称やID、自由記述、ファイル情報は収集しません。"
                  : "Measurements, table contents, experiment, condition, and sample names or IDs, free text, and file information are not collected."}
              </p>
              <p>
                {ja
                  ? "ON時は、ランダムなアプリID、起動ごとのセッションID、操作日時、アプリ・ビルド版、OS種別、入力内容ではなく固定分類された画面領域の操作件数、Graphの種類と初期表示の分類を記録します。"
                  : "When ON, BioFigureStat records a random app ID, per-launch session ID, interaction times, app and build versions, OS type, fixed screen-area interaction counts, graph type, and initial-display categories—not entered content."}
              </p>
            </div>
            <label className="about-usage-toggle">
              <input
                type="checkbox"
                aria-label={ja ? "研究データを含まない利用情報を収集する" : "Collect usage data without research data"}
                checked={usageConsent === "opted_in"}
                onChange={(event) =>
                  setUsageConsent(event.currentTarget.checked ? "opted_in" : "opted_out")
                }
              />
              <span>{usageConsent === "opted_in" ? "ON" : "OFF"}</span>
            </label>
            {usageConsent === "opted_in" && !usageTelemetryUploadConfigured() ? (
              <p className="about-usage-note">
                {ja
                  ? "このビルドには送信先が設定されていないため、外部への送信は行われません。"
                  : "This build has no upload endpoint configured, so no usage data are sent externally."}
              </p>
            ) : null}
            {usageConsent === "opted_in" && usageTelemetryUploadConfigured() ? (
              <div className="about-usage-note">
                <p>
                  {ja
                    ? "Cloudflare Workers / D1のBioFigureStat利用情報受付へ送信し、eventは90日後に削除します。通信時のIPアドレスはCloudflareで一時的に扱われる可能性がありますが、event databaseには保存しません。"
                    : "Usage events are sent to the BioFigureStat intake service on Cloudflare Workers / D1 and deleted after 90 days. Cloudflare may temporarily process an IP address during transmission, but it is not stored in the event database."}
                </p>
                {privacyContact ? (
                  <p>
                    {ja
                      ? "利用情報の削除・プライバシーに関する問い合わせ："
                      : "Usage-data deletion and privacy contact: "}
                    <a href={privacyContact.href}>{privacyContact.label}</a>
                  </p>
                ) : null}
              </div>
            ) : null}
            {usageConsent === "opted_in" && browserRequestsNoTracking() ? (
              <p className="about-usage-note">
                {ja
                  ? "追跡拒否設定より、この画面での明示的なONを優先しています。"
                  : "Your explicit ON choice here takes precedence over the browser's Do Not Track setting."}
              </p>
            ) : null}
            <p className="about-usage-note">
              {ja
                ? "OFFにすると収集を停止し、端末内の未送信情報とランダムなアプリIDを削除します。"
                : "Turning this OFF stops collection and deletes queued local events and the random app ID."}
            </p>
            {usageConsent === "opted_in" ? (
              <div className="about-usage-export">
                <span>
                  {ja ? `未送信・ローカル集計：${usageCount}件` : `Queued local events: ${usageCount}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setUsageCopyStatus(null);
                    void copyLocalUsageTelemetryReport()
                      .then(() => {
                        setUsageCount(usageTelemetryEventCount());
                        setUsageCopyStatus(
                          ja
                            ? "利用情報のローカルレポートをコピーしました。"
                            : "Copied the local usage report.",
                        );
                      })
                      .catch(() =>
                        setUsageCopyStatus(
                          ja
                            ? "コピーできませんでした。clipboard権限を確認してください。"
                            : "Could not copy. Check clipboard permission.",
                        ),
                      );
                  }}
                >
                  {ja ? "利用情報レポートをコピー" : "Copy usage report"}
                </button>
                {usageCopyStatus ? <span role="status">{usageCopyStatus}</span> : null}
              </div>
            ) : null}
          </div>
          <details>
            <summary>{ja ? "Build・ライセンス情報" : "Build and license information"}</summary>
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
