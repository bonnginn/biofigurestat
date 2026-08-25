#!/usr/bin/env python3
"""Expand the source-localized Graph pilot to the fixed 35-case non-Pool-D queue.

The input IDs are explicit.  The script does not enumerate benchmark cases and
does not read a workbook.  Historical fixtures stay immutable; new artifacts
use a ``_context_rich_v2`` lineage.  Source-method uncertainty is never filled
with a convenient product analysis: the Graph remains valid and inference is
withheld when the unit or model is not defensible.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
from html import escape
import json
from pathlib import Path
import random
import shutil
from statistics import mean, stdev
from typing import Any

from generate_expanded_personal_validation import Canvas, COLORS, axes, error_bar


ROOT = Path(__file__).resolve().parents[1]
PILOT = ROOT / "benchmark/literature_v2_1/context_rich_graph_pilot_2026-08-25"
BASE = ROOT / "benchmark/literature_v2_1/context_rich_graph_expansion_2026-08-25"
RUNS = BASE / "runs"
RUNTIME = BASE / "runtime/cases"
METHODOLOGY_VERSION = "context-rich-graph-1.1"
PILOT_IDS = ("LSA135", "LSA086", "LSA090", "LSA077", "LSA126", "LSA157", "LSA249", "LSA094", "LSA168", "LSA088", "LSA120", "LSA346")


def spec(case_id: str, family: str, pmcid: str, panel: str, question: str,
         conditions: tuple[str, ...], unit: str, graph: str,
         source_method: str, n: int, classification: str = "CONTEXT_RICH_READY",
         note: str = "") -> dict[str, Any]:
    return locals()


# Exact source panels were checked against the Europe PMC full-text Figure
# legends.  These entries correct several historical family labels rather than
# treating the repair-queue family as authority.
SPECS = (
    spec("LSA334", "two_group_continuous", "PMC9764455", "Fig. 3C", "Does Trr-dependent H3K4 hypomethylation alter larval size?", ("TrrWT", "TrrCA"), "larva", "dot_summary", "two-tailed Student t test", 20),
    spec("LSA378", "two_group_continuous", "PMC12755883", "Fig. 1B", "Does a high-fat diet reduce nephrocyte FITC-albumin uptake?", ("Normal-fat diet", "High-fat diet"), "fly", "box", "two-tailed Student t test", 6),
    spec("LSA274", "two_group_nonparametric", "PMC10837629", "Fig. 9B", "Does C. aerofaciens increase blood ethanol under a choline-deficient high-fat diet?", ("CDHF", "CDHF + C. aerofaciens"), "mouse", "box", "Wilcoxon rank-sum test", 4),
    spec("LSA324", "nested_xy", "PMC8716107", "Fig. 6B", "Does cocaine exposure increase dopaminergic-axon branching as a function of axon length?", ("Saline", "Cocaine"), "mouse with axons nested within mouse", "scatter", "two-tailed Mann–Whitney U on branch density", 2, "READY_WITH_BOUNDED_SOURCE_UNCERTAINTY", "The source displays 44/41 axons from two mice per group; axons are not promoted to independent biological n."),
    spec("LSA210", "multi_group", "PMC12855580", "Fig. 4F", "Do Piezo1 knockdown and TfR-1 inhibition reduce stiffness-associated endothelial iron accumulation?", ("NC", "si-Piezo1", "TfR-1-IN-1", "si-Piezo1 + TfR-1-IN-1"), "biological repeat", "dot_summary", "one-way ANOVA", 3),
    spec("LSA463", "multi_group", "PMC11574359", "Fig. 3A", "Does the HRS FYVE domain prefer highly curved liposomes?", ("800-nm extrusion", "200-nm extrusion", "50-nm extrusion"), "independent sample", "box", "one-way ANOVA + Bonferroni", 3),
    spec("LSA257", "cross_sectional_time", "PMC12704899", "Fig. 2B", "How does refeeding after starvation change the proportion of Vasa2+/Piwi1+ cells?", ("T5ds", "Post-refeeding day 5", "Post-refeeding day 10", "Post-refeeding day 20"), "pooled biological replicate (15 animals)", "line", "one-way ANOVA + Tukey HSD", 3),
    spec("LSA053", "multi_group_nonparametric", "PMC10688063", "Fig. 2A", "Does cisplatin dose change the number of newly arising indels across generations?", ("Control", "Low-dose cisplatin", "High-dose cisplatin"), "generation within an accumulation lineage", "box", "Kruskal–Wallis + Conover–Iman", 11, "READY_WITH_BOUNDED_SOURCE_UNCERTAINTY", "Two lineages contribute generations; lineage dependence is retained in provenance and inference is not reconstructed."),
    spec("LSA058", "multi_group_nonparametric", "PMC9597552", "Fig. 5F", "Does cky-1 deletion alter ivermectin sensitivity across treatment concentrations?", ("N2 control", "cky-1 deletion"), "independent experiment", "box", "Kruskal–Wallis", 3, "READY_WITH_BOUNDED_SOURCE_UNCERTAINTY", "The panel contains multiple ivermectin conditions; exact dose-level inference remains source-bound."),
    spec("LSA128", "factorial_descriptive", "PMC8749457", "Fig. 1C", "Which culture medium best preserves adult SAN-cell length over 40 hours?", ("M1018 0 h", "M1018 40 h", "BDM 0 h", "BDM 40 h", "Bleb 0 h", "Bleb 40 h", "nitro-Bleb 0 h", "nitro-Bleb 40 h"), "cell nested in preparation", "dot_summary", "Kruskal–Wallis + Dunn; 0-vs-40 h Mann–Whitney", 3, "READY_WITH_BOUNDED_SOURCE_UNCERTAINTY", "More than 48 cells from three preparations are displayed; preparation remains the biological unit."),
    spec("LSA139", "factorial", "PMC8519809", "Fig. 2B", "How do stabilized MERS spike immunogen and dose affect MERS S-2P IgG titers?", ("PBS", "S-2P 1 µg", "SS.V1 0.4 µg", "SS.V1 2 µg", "SS.V1 10 µg", "SS.V2 0.4 µg", "SS.V2 2 µg", "SS.V2 10 µg"), "mouse", "box", "two-way ANOVA + multiple comparisons", 10),
    spec("LSA178", "repeated_block", "PMC10730611", "Fig. 6K", "Does association with Pf4 or fd tactoids reduce gentamicin uptake?", ("No phage", "fd associated", "fd non-associated", "Pf4 associated", "Pf4 non-associated", "Pf4 ghost associated", "Pf4 ghost non-associated"), "independent experiment", "dot_summary", "source pairwise comparisons", 3, "READY_WITH_BOUNDED_SOURCE_UNCERTAINTY", "Experiment-level summaries are treated as a repeated block; cell counts are display context, not n."),
    spec("LSA300", "paired", "PMC8729788", "Fig. 1H", "Does membrane permeabilization change TMEM24 plasma-membrane fluorescence in the same cell?", ("Intact", "Permeabilized"), "cell", "paired", "within-cell comparison", 22),
    spec("LSA233", "two_group_proportion", "PMC10897188", "Fig. EV1F", "Does stromal Cep120 deletion reduce the proportion of cells containing centrosomes?", ("Control", "Cep120-KO"), "mouse", "dot_summary", "two-tailed unpaired t test", 4, "CONTEXT_RICH_READY", "Historical paired classification corrected to independent mouse groups; hundreds of cells are subsamples."),
    spec("LSA302", "nested_multi_group", "PMC10629695", "Fig. 1C", "Does centrosome amplification increase cell invasion relative to both controls?", ("−CA PLK4", "+CA PLK4", "DOX+ PLK4 1–608"), "independent experiment", "dot_summary", "one-way ANOVA + Bonferroni", 4),
    spec("LSA108", "descriptive_proportion", "PMC8685726", "Fig. 3B", "Does dissolving Sla1-GFP puncta with 1,6-hexanediol inhibit endocytosis?", ("0% HD", "Low HD", "High HD"), "cell; independent biological-repeat identity not stated", "stacked", "descriptive Graph only", 5, "CONTEXT_RICH_READY_SAFE_UNSUPPORTED", "The legend reports cell/focus counts but not an independent biological n; inference is withheld."),
    spec("LSA385", "two_group_proportion", "PMC13298801", "Fig. 2H", "Does ST8Sia6 loss increase CD8α−NK1.1+ cells among small-bowel γδ T cells?", ("WT", "ST8Sia6 KO"), "mouse", "dot_summary", "Student t test", 6),
    spec("LSA217", "survival", "PMC11372442", "Fig. 1E", "Does a low-protein diet increase mortality after LPS challenge?", ("CPD", "LPD", "CPD + LPS", "LPD + LPS"), "mouse", "survival", "two-sided log-rank (Mantel–Cox)", 15),
    spec("LSA064", "survival", "PMC9761050", "Fig. 1B", "Does a second VSV dose improve survival of CT26LacZ-bearing mice?", ("Untreated", "One VSV dose", "Two VSV doses"), "mouse", "survival", "log-rank test", 8),
    spec("LSA127", "two_group_nonparametric", "PMC13278736", "Fig. 2B", "Does oligodendrocyte ablation alter microglial density at P13–15?", ("CTL", "DTA"), "mouse", "dot_summary", "Mann–Whitney U test", 8, "CONTEXT_RICH_READY", "Historical correlation label corrected: the selected panel is an independent two-group animal comparison."),
    spec("LSA433", "multiple_testing", "PMC11772670", "Fig. 3I", "Which genes distinguish primed MER51B-GFP+LTR5_Hs-RFP+ from MER51B-GFP+ hESCs?", ("MER51B-GFP+", "MER51B-GFP+LTR5_Hs-RFP+"), "biological replicate", "heatmap", "Wald tests + Benjamini–Hochberg", 2),
    spec("LSA186", "multiple_readout", "PMC12697970", "Fig. 2F", "How do IL-17A and Epo change the erythroid-subset landscape in marrow and spleen?", ("Vehicle", "IL-17A", "Epo", "IL-17A + Epo"), "mouse", "heatmap", "panel is descriptive; related PC tests use corrected post-hoc comparisons", 6, "READY_WITH_BOUNDED_SOURCE_UNCERTAINTY", "The heatmap displays fold changes for many subsets; per-feature inferential annotations are not reconstructed."),
    spec("LSA180", "western_blot", "PMC12852734", "Fig. 1D", "Does ASD2Δ-Sh3 reduce ROCK activation relative to GFP and WT-Sh3?", ("GFP", "WT-Sh3", "ASD2Δ-Sh3"), "biological replicate", "dot_summary", "unpaired t tests", 6),
)

EXPANSION_IDS = tuple(s["case_id"] for s in SPECS)
ALL_IDS = PILOT_IDS + EXPANSION_IDS
assert len(ALL_IDS) == 35 and len(set(ALL_IDS)) == 35


def make_rows(s: dict[str, Any], rng: random.Random) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    graph = s["graph"]
    conditions = s["conditions"]
    if graph == "survival":
        for gi, group in enumerate(conditions):
            count = s["n"] if not (s["case_id"] == "LSA064" and gi == 0) else 5
            for i in range(count):
                time = max(2, 18 + gi * 8 + rng.gauss(0, 7))
                rows.append({"observationId": f"{s['case_id']}.o{len(rows)+1}", "series": group, "experimentalUnitId": f"mouse.{group}.{i+1}", "followUpTime": round(time, 3), "eventObserved": i < max(1, count - gi - 1), "synthetic": True})
        return rows
    if graph == "scatter":
        for gi, group in enumerate(conditions):
            for mouse in range(s["n"]):
                for axon in range(10):
                    x = max(10, rng.gauss(70, 22)); y = max(0, (.012 + gi * .025) * x + rng.gauss(0, .7))
                    rows.append({"observationId": f"{s['case_id']}.o{len(rows)+1}", "series": group, "experimentalUnitId": f"mouse.{group}.{mouse+1}", "nestedObservationId": f"axon.{axon+1}", "x": round(x, 4), "value": round(y, 4), "synthetic": True})
        return rows
    if graph == "heatmap":
        for feature in range(18):
            for gi, group in enumerate(conditions):
                rows.append({"observationId": f"{s['case_id']}.o{len(rows)+1}", "series": group, "experimentalUnitId": f"feature.{feature+1}", "featureId": f"Feature {feature+1:02d}", "value": round(rng.gauss((gi - .5) * (1 if feature % 3 else -1), .25), 4), "synthetic": True, "displayOnly": True})
        return rows
    for gi, group in enumerate(conditions):
        center = 50 + gi * 9
        n = min(max(s["n"], 3), 12)
        for i in range(n):
            unit = f"unit.{i+1}" if s["family"] in {"paired", "repeated_block"} else f"unit.{group}.{i+1}"
            value = max(0, center + rng.gauss(0, 6))
            rows.append({"observationId": f"{s['case_id']}.o{len(rows)+1}", "series": group, "experimentalUnitId": unit, "pairId": unit if s["family"] in {"paired", "repeated_block"} else None, "x": gi if graph == "line" else None, "value": round(value, 4), "synthetic": True})
    return rows


def render(s: dict[str, Any], rows: list[dict[str, Any]], out: Path) -> None:
    c = Canvas(s["case_id"]); c.text(600, 35, f"{s['case_id']}_context_rich_v2 — {s['panel']}", 20, bold=True)
    graph = s["graph"]
    if graph == "survival":
        left, top, pw, ph = axes(c, x_label="Follow-up time", y_label="Event-free proportion", y_min=0, y_max=1)
        max_t = max(r["followUpTime"] for r in rows)
        for gi, group in enumerate(s["conditions"]):
            selected = sorted((r for r in rows if r["series"] == group), key=lambda r: r["followUpTime"])
            at_risk = len(selected); surv = 1.0; pts = [(left, top)]
            for r in selected:
                if r["eventObserved"]: surv *= (at_risk - 1) / at_risk
                pts.append((left + r["followUpTime"] / max_t * pw, top + ph - surv * ph)); at_risk -= 1
            c.polyline(pts, COLORS[gi % len(COLORS)], 3); c.text(left + pw + 20, top + 25 + gi * 26, group, 13, "start", fill=COLORS[gi % len(COLORS)])
    elif graph == "scatter":
        xmax = max(r["x"] for r in rows); ymax = max(r["value"] for r in rows); left, top, pw, ph = axes(c, x_label="Axon length", y_label="Branch count", y_min=0, y_max=ymax * 1.1)
        for gi, group in enumerate(s["conditions"]):
            for r in (x for x in rows if x["series"] == group): c.circle(left + r["x"] / xmax * pw, top + ph - r["value"] / (ymax * 1.1) * ph, 3, COLORS[gi])
            c.text(left + pw + 20, top + 25 + gi * 26, group, 13, "start", fill=COLORS[gi])
    elif graph == "heatmap":
        features = list(dict.fromkeys(r["featureId"] for r in rows)); groups = s["conditions"]
        for fi, feature in enumerate(features):
            for gi, group in enumerate(groups):
                value = next(r["value"] for r in rows if r["featureId"] == feature and r["series"] == group)
                color = "#b40426" if value >= 0 else "#3b4cc0"; c.rect((260 + gi * 220, 70 + fi * 27, 470 + gi * 220, 94 + fi * 27), fill=color, outline="white", width=1, opacity=min(1, .35 + abs(value) / 2))
            c.text(245, 88 + fi * 27, feature, 11, "end")
        for gi, group in enumerate(groups): c.text(365 + gi * 220, 575, group, 13, bold=True)
    elif graph == "line":
        vals = [r["value"] for r in rows]; left, top, pw, ph = axes(c, x_label="Ordered source state", y_label="Source readout", y_min=min(vals) * .9, y_max=max(vals) * 1.1)
        summaries=[]
        for gi, group in enumerate(s["conditions"]): summaries.append((left + gi / (len(s["conditions"])-1) * pw, top + ph - (mean(r["value"] for r in rows if r["series"] == group)-min(vals)*.9)/(max(vals)*1.1-min(vals)*.9)*ph))
        c.polyline(summaries, COLORS[0], 3)
        for (x,y),group in zip(summaries,s["conditions"]): c.circle(x,y,5,COLORS[0]); c.text(x,top+ph+30,group,11,bold=True)
    else:
        vals = [r["value"] for r in rows]; left, top, pw, ph = axes(c, x_label="Source condition", y_label="Source readout", y_min=0, y_max=max(vals) * 1.25)
        for gi, group in enumerate(s["conditions"]):
            selected=[r["value"] for r in rows if r["series"] == group]; x=left+pw*(gi+.5)/len(s["conditions"]); y=lambda v:top+ph-v/(max(vals)*1.25)*ph
            for i,v in enumerate(selected): c.circle(x+(i-(len(selected)-1)/2)*5,y(v),4,COLORS[gi%len(COLORS)])
            avg=mean(selected); sd=stdev(selected) if len(selected)>1 else 0; error_bar(c,x,y(avg+sd),y(max(0,avg-sd)),COLORS[gi%len(COLORS)]); c.line((x-16,y(avg),x+16,y(avg)),COLORS[gi%len(COLORS)],3); c.text(x,top+ph+30,group,10,bold=True)
    out.mkdir(parents=True, exist_ok=True); c.save(out/"default_graph.svg", out/"default_graph.png"); shutil.copy2(out/"default_graph.svg",out/"final_graph.svg"); shutil.copy2(out/"default_graph.png",out/"final_graph.png")


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True); path.write_text(json.dumps(payload, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")


def main() -> None:
    generated = datetime.now(timezone.utc).isoformat(); rng = random.Random(20260825); manifests=[]
    for cid in PILOT_IDS:
        lineage=f"{cid}_context_rich_v2"; shutil.copytree(PILOT/"runs"/lineage, RUNS/lineage, dirs_exist_ok=True); shutil.copytree(PILOT/"runtime/cases"/lineage, RUNTIME/lineage, dirs_exist_ok=True)
        p=json.loads((PILOT/"runs"/lineage/"project_state.json").read_text(encoding="utf-8")); sc=json.loads((PILOT/"runs"/lineage/"support_classification.json").read_text(encoding="utf-8"))
        manifests.append({"caseId":cid,"lineageId":lineage,"batchFamily":"pilot_revalidated","correctedFamily":p["graph"]["type"],"classification":sc["classification"],"panel":p["goldFigureBrief"]["source"]["targetPanel"],"sourceUrl":p["goldFigureBrief"]["source"]["url"],"runRoot":f"runs/{lineage}"})
    for s in SPECS:
        cid=s["case_id"]; lineage=f"{cid}_context_rich_v2"; rows=make_rows(s,rng); run_dir=RUNS/lineage; render(s,rows,run_dir)
        analysis={"status":"not_executed","reason":"Graph capability reconstruction; source analysis is recorded but no synthetic result is represented as the paper result.","sourceMethod":s["source_method"]}
        graph={"schemaVersion":"1.0.0","type":s["graph"],"analysisResultAuthority":False,"displaySet":"deterministic synthetic reconstruction","analysisSet":"withheld unless unit/model is explicitly supported","comparisonSet":s["question"],"annotationSet":"none without an authoritative saved result"}
        source={"pmcid":s["pmcid"],"url":f"https://europepmc.org/articles/{s['pmcid']}","targetPanel":s["panel"],"figureLegendChecked":True}
        brief={"schemaVersion":"1.1.0","caseId":lineage,"originalCaseId":cid,"scientificQuestion":s["question"],"conditions":list(s["conditions"]),"statisticalUnit":s["unit"],"sourceMethod":s["source_method"],"source":source,"sourceBoundaryNote":s["note"],"syntheticPolicy":"Values are deterministic synthetic reconstruction, never published raw observations."}
        project={"schemaVersion":"0.3.0","caseId":lineage,"dataset":{"sourceStatus":"SYNTHETIC_RECONSTRUCTION","observations":rows},"goldFigureBrief":brief,"analysis":analysis,"graph":graph,"provenance":{"generatedAt":generated,"generator":"scripts/expand_context_rich_graph_subset.py","methodologyVersion":METHODOLOGY_VERSION,"originalCaseId":cid,"candidateFamilyReclassified":s["family"],"poolDOpened":False}}
        write_json(RUNTIME/lineage/"case.json",{"caseId":lineage,"classification":s["classification"],"goldFigureBrief":brief,"syntheticData":rows})
        write_json(run_dir/"statistics.json",analysis); write_json(run_dir/"graph_state.json",graph); write_json(run_dir/"project_state.json",project); write_json(run_dir/"support_classification.json",{"caseId":cid,"classification":s["classification"],"note":s["note"]})
        (run_dir/"methods.txt").write_text(f"Case: {lineage}\nSource: {source['url']} ({s['panel']})\nScientific question: {s['question']}\nStatistical unit: {s['unit']}\nSource analysis: {s['source_method']}\nSynthetic policy: deterministic reconstruction; no value is represented as published data.\nAnalysis status: not executed for Graph capability expansion.\n",encoding="utf-8")
        digest=hashlib.sha256((run_dir/"final_graph.svg").read_bytes()).hexdigest(); write_json(run_dir/"run.json",{"caseId":lineage,"outcome":s["classification"],"artifactCompleteness":"complete","generatedAt":generated,"finalGraphSha256":digest})
        manifests.append({"caseId":cid,"lineageId":lineage,"batchFamily":s["family"],"correctedFamily":s["graph"],"classification":s["classification"],"panel":s["panel"],"sourceUrl":source["url"],"runRoot":f"runs/{lineage}"})
    counts=Counter(m["classification"] for m in manifests); family_counts=Counter(m["batchFamily"] for m in manifests if m["batchFamily"]!="pilot_revalidated")
    write_json(BASE/"expansion_manifest.json",{"schemaVersion":"1.0.0","methodologyVersion":METHODOLOGY_VERSION,"status":"FAMILY_EXPANSION_COMPLETE","caseCount":35,"pilotCaseCount":12,"expandedCaseCount":23,"caseIds":list(ALL_IDS),"classifications":dict(counts),"familyBatches":dict(family_counts),"cases":manifests,"poolDOpened":False,"workbookOpened":False})
    write_json(BASE/"family_batch_audit.json",{"verdict":"READY_WITH_BOUNDED_EXCEPTIONS","readyDefinition":"Exact panel and scientific display are source-localized; unsupported or under-specified inference is withheld rather than approximated.","methodologyRules":["panel before family","paper family may override historical candidate family","biological unit before n","display/analysis/comparison/annotation sets remain separate","safe unsupported is an acceptable Alpha boundary","synthetic values are never published observations"],"classificationCounts":dict(counts),"familyBatchCounts":dict(family_counts),"correctedHistoricalFamilies":[{"caseId":"LSA127","from":"correlation","to":"two_group_nonparametric"},{"caseId":"LSA233","from":"paired","to":"independent two-group proportion"},{"caseId":"LSA257","from":"multi_group","to":"cross-sectional ordered time"}]})
    cards="".join(f'<article><h2>{m["caseId"]} · {escape(m["panel"])}</h2><p>{escape(m["classification"])}</p><img src="../runs/{m["lineageId"]}/final_graph.png" alt="{m["caseId"]} final Graph"><p>{escape(m["batchFamily"])}</p><p><a href="{m["sourceUrl"]}">Primary source</a></p></article>' for m in manifests)
    browser=BASE/"comparison_browser"; browser.mkdir(parents=True,exist_ok=True); (browser/"index.html").write_text(f'<!doctype html><meta charset="utf-8"><title>Context-rich family expansion</title><style>body{{font-family:Arial;margin:24px;background:#f4f6f8}}main{{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:18px}}article{{background:white;padding:16px;border-radius:10px}}img{{width:100%;height:auto;border:1px solid #ccd3da}}h1{{font-size:28px}}</style><h1>Context-rich Graph subset · 35 cases</h1><p>FAMILY EXPANSION COMPLETE · methodology 1.1 · Pool D/workbook not opened.</p><main>{cards}</main>',encoding="utf-8")
    # Update the pilot hand-off only after all 35 case artifacts exist.
    write_json(PILOT/"autonomous_expansion_manifest.json",{"status":"COMPLETED_BY_FAMILY_BATCH","pilotCount":12,"finalSubsetCount":35,"target":35,"methodologyVersion":METHODOLOGY_VERSION,"expansionRoot":"benchmark/literature_v2_1/context_rich_graph_expansion_2026-08-25","poolDOpened":False})
    audit=json.loads((PILOT/"pilot_method_audit.json").read_text(encoding="utf-8")); audit["autonomousExpansionPerformed"]=True; audit["expansionCaseCount"]=35; audit["expansionVerdict"]="READY_WITH_BOUNDED_EXCEPTIONS"; write_json(PILOT/"pilot_method_audit.json",audit)
    print(json.dumps({"caseCount":35,"expanded":23,"classifications":dict(counts),"verdict":"READY_WITH_BOUNDED_EXCEPTIONS"},indent=2))


if __name__ == "__main__": main()
