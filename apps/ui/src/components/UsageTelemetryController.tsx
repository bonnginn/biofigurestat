import { useEffect, useRef } from "react";

import type { AppRoute } from "../app/routes";
import {
  browserRequestsNoTracking,
  flushUsageTelemetry,
  recordUsageError,
  recordUsageInteraction,
  recordUsageRoute,
  setUsageConsent,
  usageTelemetryUploadConfigured,
  useUsageConsent,
  type UsageInteractionCategory,
} from "../app/usageTelemetry";
import "./UsageTelemetryController.css";

function interactionCategory(target: EventTarget | null): UsageInteractionCategory {
  if (!(target instanceof Element)) return "other_control";
  const fixedArea = target.closest<HTMLElement>("[data-usage-area]")?.dataset.usageArea;
  switch (fixedArea) {
    case "entry_choice":
    case "condition_definition":
    case "measurement_definition":
    case "combination_review":
    case "unit_relationship":
    case "ordered_structure":
    case "setup_summary":
      return fixedArea;
    default:
      break;
  }
  if (target.closest("[role='grid'], table, .spreadsheet-grid, .canonical-matrix")) {
    return "spreadsheet";
  }
  if (target.closest(".graph-workbench, .graph-inspector, .graph-stage, .graph-toolbar")) {
    return "graph_control";
  }
  if (target.closest("nav, .brand, .back-link")) return "navigation";
  if (target.closest(".primary-button, button[type='submit']")) return "primary_action";
  if (target.closest("input, select, textarea")) return "form_control";
  return "other_control";
}

export function UsageTelemetryController({ route }: Readonly<{ route: AppRoute }>) {
  const consent = useUsageConsent();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (consent !== "undecided") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Start at the beginning of the consent notice. Focusing the first action
    // button would scroll a short viewport to the bottom of the dialog before
    // the researcher has read what is collected.
    dialog.scrollTop = 0;
    dialog.focus({ preventScroll: true });
    const backdrop = dialog.closest(".usage-consent-backdrop");
    const appShell = backdrop?.closest(".app-shell");
    if (!backdrop || !appShell) return;
    const background = [...appShell.children].filter((element) => element !== backdrop);
    const previous = background.map((element) => ({
      element,
      hadInert: element.hasAttribute("inert"),
      ariaHidden: element.getAttribute("aria-hidden"),
    }));
    for (const element of background) {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    }
    return () => {
      for (const state of previous) {
        if (!state.hadInert) state.element.removeAttribute("inert");
        if (state.ariaHidden === null) state.element.removeAttribute("aria-hidden");
        else state.element.setAttribute("aria-hidden", state.ariaHidden);
      }
    };
  }, [consent]);

  useEffect(() => {
    if (consent !== "opted_in") return;
    recordUsageRoute(route);
  }, [consent, route]);

  useEffect(() => {
    if (consent !== "opted_in") return;
    const handleClick = (event: MouseEvent) => {
      const category = interactionCategory(event.target);
      recordUsageInteraction(route, "click", category);
    };
    const handleChange = (event: Event) => {
      const category = interactionCategory(event.target);
      recordUsageInteraction(route, "change", category);
    };
    const flush = () => flushUsageTelemetry();
    const recordUnexpectedApplicationError = () =>
      recordUsageError(route, "UNEXPECTED_APPLICATION_ERROR");
    document.addEventListener("click", handleClick, true);
    document.addEventListener("change", handleChange, true);
    window.addEventListener("pagehide", flush);
    // Never inspect ErrorEvent or PromiseRejectionEvent. Their message, reason,
    // filename, stack, and payload can contain unpublished researcher input.
    window.addEventListener("error", recordUnexpectedApplicationError);
    window.addEventListener("unhandledrejection", recordUnexpectedApplicationError);
    // A local-only build must retain early milestones until the researcher
    // explicitly exports the local report or leaves the route. Flushing the
    // aggregates every 30 seconds would turn them into queue entries and can
    // evict those milestones from the bounded queue during a long session.
    const interval = usageTelemetryUploadConfigured()
      ? window.setInterval(flush, 30_000)
      : undefined;
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("change", handleChange, true);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("error", recordUnexpectedApplicationError);
      window.removeEventListener("unhandledrejection", recordUnexpectedApplicationError);
      if (interval !== undefined) window.clearInterval(interval);
      flush();
    };
  }, [consent, route]);

  if (consent !== "undecided") return null;
  const doNotTrack = browserRequestsNoTracking();
  const uploadConfigured = usageTelemetryUploadConfigured();
  return (
    <div className="usage-consent-backdrop">
      <section
        ref={dialogRef}
        className="usage-consent-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="usage-consent-heading"
        aria-describedby="usage-consent-description"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            return;
          }
          if (event.key !== "Tab") return;
          const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input:not([disabled])",
          );
          if (!controls?.length) return;
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (!event.shiftKey && document.activeElement === dialogRef.current) {
            event.preventDefault();
            first.focus();
          } else if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === dialogRef.current)
          ) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <p className="overline">初回のみ</p>
        <h1 id="usage-consent-heading">
          研究データを含まない利用情報を、製品改善に役立ててもよいですか？
        </h1>
        <div id="usage-consent-description" className="usage-consent-copy">
          <p>収集するのは、画面・操作・Graph設定・完了／エラーの固定分類と回数です。</p>
          <p>
            <strong>
              測定値、表の内容、実験名、条件名、readout名、試料ID、自由記述、ファイル名・パス、clipboard内容、project名は収集しません。
            </strong>
          </p>
          <details>
            <summary>記録項目と送信について詳しく見る</summary>
            <div className="usage-consent-details">
              <p>
                ONにすると、複数回の利用をまとめるためのランダムなアプリID、起動ごとのセッションID、操作日時、アプリ・ビルド版、OS種別を記録します。
              </p>
              {uploadConfigured ? (
                <p>
                  このビルドには送信先が設定されています。送信時には、通信に伴うIPアドレスなどの通信情報が送信先で扱われる可能性があります。
                </p>
              ) : (
                <p>このビルドには送信先が設定されていないため、外部への送信は行いません。</p>
              )}
              <p>
                Aboutからいつでも変更できます。OFFにすると未送信情報とランダムなアプリIDを削除します。
              </p>
            </div>
          </details>
          {doNotTrack ? (
            <p className="usage-consent-dnt" role="note">
              この環境では追跡拒否設定が有効です。「協力する」を明示的に選んだ場合だけ、このアプリの利用情報収集をONにします。
            </p>
          ) : null}
        </div>
        <div className="usage-consent-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setUsageConsent("opted_out")}
          >
            協力しない
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setUsageConsent("opted_in")}
          >
            協力する
          </button>
        </div>
      </section>
    </div>
  );
}
