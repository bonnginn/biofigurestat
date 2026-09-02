import { describe, expect, it } from "vitest";

import { expectNoJapaneseUi } from "../test/expectNoJapaneseUi";
import {
  biologicalHandoffStopMessage,
  biologicalWorkspaceStopMessage,
} from "./newExperimentMessages";

describe("new experiment messages", () => {
  it("keeps heterogeneous-readout explanations specific in Japanese", () => {
    expect(
      biologicalWorkspaceStopMessage([
        "heterogeneous_readout_grains",
        "heterogeneous_readout_axes",
      ]),
    ).toContain("時間・距離");
  });

  it("does not expose legacy Japanese stop reasons in English", () => {
    const messages = [
      biologicalWorkspaceStopMessage(["heterogeneous_readout_grains"], "en"),
      biologicalWorkspaceStopMessage(["heterogeneous_readout_axes"], "en"),
      biologicalWorkspaceStopMessage([], "en"),
      biologicalHandoffStopMessage("en", "presentation"),
      biologicalHandoffStopMessage("en", "table_promotion", "日本語の内部理由"),
      biologicalHandoffStopMessage("en", "graph_rebind", "日本語の内部理由"),
      biologicalHandoffStopMessage("en", "unexpected"),
    ];
    const renderedNotice = document.createElement("div");
    renderedNotice.textContent = messages.join(" ");
    expectNoJapaneseUi(renderedNotice);
    expect(messages.join(" ")).toContain("retained");
  });
});
