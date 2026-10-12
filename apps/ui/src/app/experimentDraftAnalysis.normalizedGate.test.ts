import { describe, it, expect } from "vitest";
import {createExperimentSetDraft, experimentCellKey, type ExperimentCellMap} from "./experimentDraft";
import {assessDraftGraphAnalysis} from "./experimentDraftAnalysis";
function fixture(normalized: boolean) {
  const base=createExperimentSetDraft("general_assay","nested_continuous");
  const conditions=base.conditions.slice(0,3);
  const draft={...base,conditions,controlConditionId:conditions[0]!.id,
    readouts:base.readouts.map(r=>({...r,...(normalized?{withinExperimentNormalization:{method:"control_equals_one" as const,baselineConditionId:conditions[0]!.id}}:{})}))};
  const samples=normalized?[[2,4,8],[3,8,20],[2.4,6.8,17.6]]:[[1,1,1],[1.5,2,2.5],[1.2,1.7,2.2]];
  const cells:Record<string, ExperimentCellMap[string]>={};
  draft.experiments.forEach((e,j)=>conditions.forEach((c,i)=>{
    cells[experimentCellKey({experimentId:e.id,conditionId:c.id,readoutId:draft.readouts[0]!.id})]=
      {kind:"nested_continuous",rawValues:[samples[i]![j]!],source:"manual"};
  }));
  return {draft,cells};
}
describe("B01 explicit normalization provenance boundary",()=>{
  it("stops independent multi-group inference without counting x/x controls as n/df",()=>{
    const {draft,cells}=fixture(true); const before=structuredClone(cells);
    const result=assessDraftGraphAnalysis({draft,cells,readoutId:draft.readouts[0]!.id,
      conditionIds:draft.conditions.map(c=>c.id),contrastIntent:"control_vs_many"});
    expect(result.state).toBe("unsupported");expect(result.request).toBeNull();
    expect(result.reason).toMatch(/正規化/);expect(cells).toEqual(before);
  });
  it("does not infer normalization from naturally constant raw controls",()=>{
    const {draft,cells}=fixture(false);
    const result=assessDraftGraphAnalysis({draft,cells,readoutId:draft.readouts[0]!.id,
      conditionIds:draft.conditions.map(c=>c.id),contrastIntent:"control_vs_many"});
    expect(result.state).toBe("ready");expect(result.request).toMatchObject({templateId:"D03",method:"one_way_anova"});
    expect(result.request!.observations.filter(o=>o.conditionId===draft.conditions[0]!.id).map(o=>o.value)).toEqual([1,1,1]);
  });
});

it('does not replace explicit control intent when the control is absent',()=>{const {draft,cells}=fixture(false);const r=assessDraftGraphAnalysis({draft:{...draft,controlConditionId:'missing.control'},cells,readoutId:draft.readouts[0].id,conditionIds:draft.conditions.map(c=>c.id),contrastIntent:'control_vs_many'});expect(r.state).toBe('unsupported');expect(r.request).toBeNull();expect(r.reason).toMatch(/対照/);});
