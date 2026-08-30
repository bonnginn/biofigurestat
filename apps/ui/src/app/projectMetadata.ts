import type { ProjectMetadata } from "@lsaa/domain";

export type ProjectMetadataDraft = Readonly<
  Pick<ProjectMetadata, "projectName" | "experimentDate"> &
    Partial<Pick<ProjectMetadata, "operator" | "batch" | "note">>
>;

function localDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultProjectMetadataDraft(
  purpose: "western_blot" | "microscopy",
): ProjectMetadataDraft {
  return {
    projectName:
      purpose === "western_blot" ? "新しいウェスタンブロット実験" : "新しい顕微鏡解析実験",
    experimentDate: localDate(),
    operator: "",
    batch: "",
    note: "",
  };
}

export function metadataDraftIsComplete(draft: ProjectMetadataDraft): boolean {
  return draft.projectName.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(draft.experimentDate);
}

export function metadataForPersistence(
  draft: ProjectMetadataDraft,
): Pick<ProjectMetadata, "projectName" | "experimentDate" | "operator" | "batch" | "note"> {
  return {
    projectName: draft.projectName.trim(),
    experimentDate: draft.experimentDate,
    operator: draft.operator?.trim() || undefined,
    batch: draft.batch?.trim() || undefined,
    note: draft.note?.trim() || undefined,
  };
}
