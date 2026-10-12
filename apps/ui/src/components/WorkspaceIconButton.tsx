import { useId, type ButtonHTMLAttributes } from "react";

type Action = "home" | "new" | "open" | "save" | "undo" | "redo" | "back";
const paths: Record<Action, string> = {
  home: "M2 8 8 2l6 6M4 7v7h8V7M7 14v-4h2v4",
  new: "M8 2v12M2 8h12",
  open: "M2 13V4h4l2 2h6v2M2 13h10l3-5H5l-3 5Z",
  save: "M2 2h10l2 2v10H2V2ZM5 2v4h6V2M5 14V9h6v5",
  undo: "M6 3 2 7l4 4M2 7h7a5 5 0 0 1 5 5",
  redo: "m10 3 4 4-4 4M14 7H7a5 5 0 0 0-5 5",
  back: "M7 3 2 8l5 5M2 8h12",
};

/** Familiar actions only; scientific and unfamiliar actions retain text labels. */
export function WorkspaceIconButton({
  action,
  label,
  shortcut,
  disabledReason,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  action: Action;
  label: string;
  shortcut?: string;
  disabledReason?: string;
}) {
  const reasonId = useId();
  const title = [label, shortcut, props.disabled ? disabledReason : undefined]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className="workspace-icon-action" title={title}>
      <button
        {...props}
        type={props.type ?? "button"}
        className={`workspace-icon-button ${className}`}
        aria-label={label}
        title={title}
        aria-describedby={props.disabled && disabledReason ? reasonId : props["aria-describedby"]}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d={paths[action]} />
        </svg>
      </button>
      {props.disabled && disabledReason ? (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}
