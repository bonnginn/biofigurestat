import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deriveDesignProgress } from "./design-progress-model.js";

const prototypeHtml = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const prototypeCss = readFileSync(new URL("./prototype.css", import.meta.url), "utf8");
const prototypeJs = readFileSync(new URL("./prototype.js", import.meta.url), "utf8");

test("initial entry makes conditions active and keeps later steps upcoming", () => {
  const progress = deriveDesignProgress();
  assert.equal(progress.expandedStep, "conditions");
  assert.deepEqual(progress.steps, {
    conditions: "active",
    canvas: "upcoming",
    flow: "upcoming",
  });
  assert.equal(progress.canContinueFromCanvas, false);
});

test("a built all-performed canvas becomes active while conditions are complete", () => {
  const progress = deriveDesignProgress({ canvasReady: true, expandedStep: "canvas" });
  assert.deepEqual(progress.steps, {
    conditions: "complete",
    canvas: "active",
    flow: "upcoming",
  });
  assert.equal(progress.canContinueFromCanvas, true);
});

test("unknown combinations revoke acknowledgement and safely return to canvas", () => {
  const progress = deriveDesignProgress({
    canvasReady: true,
    conditionAcknowledged: true,
    unknownConditionCount: 2,
    expandedStep: "flow",
  });
  assert.equal(progress.conditionAcknowledged, false);
  assert.equal(progress.expandedStep, "canvas");
  assert.equal(progress.canContinueFromCanvas, false);
  assert.equal(progress.steps.flow, "upcoming");
});

test("acknowledged conditions open flow without claiming unresolved structure is complete", () => {
  const progress = deriveDesignProgress({
    canvasReady: true,
    conditionAcknowledged: true,
    expandedStep: "flow",
  });
  assert.equal(progress.steps.conditions, "complete");
  assert.equal(progress.steps.canvas, "complete");
  assert.equal(progress.steps.flow, "active");
  assert.equal(progress.flowReady, false);
});

test("an observation issue prevents a completed flow summary", () => {
  const progress = deriveDesignProgress({
    canvasReady: true,
    conditionAcknowledged: true,
    observationReady: true,
    hasObservationIssue: true,
    expandedStep: "conditions",
  });
  assert.equal(progress.steps.flow, "available");
  assert.equal(progress.flowReady, false);
});

test("resolved observation structure can be represented by a completed summary", () => {
  const progress = deriveDesignProgress({
    canvasReady: true,
    conditionAcknowledged: true,
    observationReady: true,
    expandedStep: "canvas",
  });
  assert.equal(progress.steps.flow, "complete");
  assert.equal(progress.flowReady, true);
});

test("workflow DOM exposes status-labelled stage navigation and repair summaries", () => {
  assert.equal((prototypeHtml.match(/class="design-stage(?: active)?"/g) ?? []).length, 3);
  assert.match(prototypeHtml, /data-design-stage="conditions" data-stage-status="current"[^>]*aria-current="step"/);
  assert.match(prototypeHtml, /data-design-stage="canvas" data-stage-status="next"/);
  assert.match(prototypeHtml, /data-design-stage="flow" data-stage-status="pending"/);
  assert.equal((prototypeHtml.match(/class="design-stage-state"/g) ?? []).length, 3);

  for (const [summaryId, contentId] of [
    ["conditions-step-summary", "conditions-step-content"],
    ["canvas-step-summary", "canvas-step-content"],
    ["flow-step-summary", "flow-step-content"],
  ]) {
    const summaryStart = prototypeHtml.match(new RegExp(`<button[^>]+id="${summaryId}"[^>]*>`))?.[0] ?? "";
    assert.match(summaryStart, new RegExp(`aria-controls="${contentId}"`));
    assert.match(prototypeHtml, new RegExp(`id="${contentId}"`));
  }
  assert.equal((prototypeHtml.match(/class="step-summary-edit">修正</g) ?? []).length, 3);
});

test("workflow CSS keeps summaries visible but only renders the active form body", () => {
  assert.doesNotMatch(prototypeCss, /\.progress-card\.stage-hidden/);
  assert.match(prototypeCss, /\.progress-card:not\(\[data-progress-state="active"\]\) > \.card-heading,\s*\.progress-card:not\(\[data-progress-state="active"\]\) > \.step-active-content\s*{\s*display:\s*none;/);
  assert.match(prototypeCss, /\.progress-card\[data-progress-state="active"\] > \.step-summary-row\s*{\s*display:\s*none;/);
  assert.doesNotMatch(prototypeCss, /\.progress-card\[data-progress-state="upcoming"\]\s*{[^}]*display:\s*none;/s);
  assert.match(prototypeCss, /\.progress-card\[data-progress-state\]::after\s*{\s*display:\s*none;\s*content:\s*none;/);
  assert.match(prototypeCss, /\.step-summary-row\s*{\s*display:\s*grid;/);
  assert.doesNotMatch(prototypeCss, /\n\s*\.step-summary-edit\s*{\s*display:\s*none;/);
});

test("workflow renderer synchronizes inert content, summaries, and navigation status", () => {
  assert.doesNotMatch(prototypeJs, /classList\.toggle\("stage-hidden"/);
  assert.match(prototypeJs, /content\.toggleAttribute\("inert", !active\)/);
  assert.match(prototypeJs, /content\.setAttribute\("aria-hidden", String\(!active\)\)/);
  assert.match(prototypeJs, /summary\.disabled = progressState === "upcoming"/);
  assert.match(prototypeJs, /summaryAction\.textContent = progressState === "complete" \? "修正" : progressState === "available" \? "開く" : ""/);
  assert.match(prototypeJs, /stageButton\.dataset\.stageStatus = stageStatus/);
  assert.match(prototypeJs, /stageButton\.setAttribute\("aria-label", `\$\{stageLabel\}、\$\{stageStatusCopy\[stageStatus\]\}`\)/);
  assert.match(prototypeJs, /stateNode\.textContent = progressState === "active" \? "現在" : progressState === "complete" \? "完了"/);
});

test("outer-unit guidance keeps the condition receiver separate from a shared source", () => {
  assert.doesNotMatch(prototypeHtml, /同じDonor由来材料を各条件へ分けたなら「Donor」/);
  assert.match(prototypeHtml, /別々に処置を受けた対象・試料/);
  assert.match(prototypeHtml, /同じDonorや同じ調製元に由来する場合、そのつながりは次の質問で別に記録/);
  assert.match(prototypeJs, /共有するDonorや調製元は次の質問で別に記録/);
});

test("opening Data flushes the latest visible hierarchy before the first compact render", () => {
  assert.match(prototypeJs, /function flushPendingObservationGuide\(\)[\s\S]*syncHierarchyLevelText\(\);[\s\S]*applyObservationGuide\(\);/);
  assert.match(
    prototypeJs,
    /button\.dataset\.workspaceView === "data"\) flushPendingObservationGuide\(\);\s*if \(button\.dataset\.workspaceView === "data" && !adaptiveSurfaceReady\(\)\) return;/,
  );
  assert.match(
    prototypeJs,
    /#open-data-workspace-inline[\s\S]*flushPendingObservationGuide\(\);\s*if \(!adaptiveSurfaceReady\(\)\) return;/,
  );
});
