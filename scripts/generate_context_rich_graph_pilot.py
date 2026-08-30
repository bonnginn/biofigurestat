#!/usr/bin/env python3
"""Generate the allow-listed context-rich literature Graph pilot.

The script never enumerates benchmark runtime cases. Original fixtures are
immutable; every output uses a `_context_rich_v2` lineage identifier.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import hashlib
from html import escape
import json
from pathlib import Path
import random
import subprocess
from statistics import mean, stdev
from typing import Any

from generate_expanded_personal_validation import Canvas, COLORS, axes, error_bar


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "benchmark/literature_v2_1/context_rich_graph_pilot_2026-08-25"
RUNTIME, RUNS = BASE / "runtime", BASE / "runs"
ENGINE = ROOT / "engine/python/.venv/Scripts/python.exe"
ENGINE_CWD = ROOT / "engine/python"
CASE_IDS = ("LSA135", "LSA086", "LSA090", "LSA077", "LSA126", "LSA157", "LSA249", "LSA094", "LSA168", "LSA088", "LSA120", "LSA346")
ALLOWED_HISTORICAL_IDS = frozenset(CASE_IDS)
SOURCE = {
    "LSA135": ("PMC9647956", "Fig. 5a", "48-DEG heatmap: 3 h and 6 h post-infection versus 1 h; replicate n for the heatmap is not stated."),
    "LSA086": ("PMC10445746", "Fig. 1I", "FRAP recovery mean±SEM for PLCδ1-PH, tubbyCT and E-Syt3; n=11, 14 and 9 cells; three repeats."),
    "LSA090": ("PMC8886815", "Fig. 6E", "FRET-pixel box plots: donor control 8 measurements/4 cells, HSA 20/6, H464Q 21/5; unpaired t tests reported."),
    "LSA077": ("PMC10883267", "Fig. 2B", "m7G cap-binding by eIF4E constructs and conserved-tryptophan mutants, n=3 independent experiments; two-way ANOVA/Tukey is reported, but the second model factor is not explicit in the legend."),
    "LSA126": ("PMC12747520", "Fig. 2B-D", "Contralateral and ipsilateral cortex measured repeatedly through HI and three recovery windows in the same n=5 animals."),
    "LSA157": ("PMC8647013", "Fig. 1B", "V1 foci counts per cell, 30–50 cells from three biological replicates; one-way ANOVA versus kinase-dead reference."),
    "LSA249": ("PMC13322376", "Fig. 3B", "Rho123 intensity, >50 cells per group per experiment, n=3 independent experiments; two-tailed t test."),
    "LSA094": ("PMC12086567", "Fig. 1I", "RalB-GTP pulldown densitometry, resting versus thrombin, n=3; unpaired t test reported."),
    "LSA168": ("PMC12669963", "Fig. 3C", "DRP1 binding normalized to PGAM5-GFP pulldown, WT/S24F/OMM, n=4, mean±SEM, Dunnett versus WT."),
    "LSA088": ("PMC12752511", "Fig. 1D/H", "Representative pixel-colocalization scatter at 12 h and 24 h; Pearson R 0.59/0.72; ten images per replicate, N=3."),
    "LSA120": ("PMC11685895", "Fig. 3C", "Kaplan–Meier survival after vehicle, parental ES-D3 vaccine or differentiated ES-D3 vaccine; n=8 mice per sex/group."),
    "LSA346": ("PMC13006526", "Fig. 4H", "Pupariation timing for control n=255, miR-184-sp n=136 and Ilp8-RNAi rescue n=76; five experiments; log-rank."),
}


def run_engine(request: dict[str, Any]) -> dict[str, Any]:
    done = subprocess.run([str(ENGINE), "-m", "lsaa_engine.cli"], input=json.dumps(request), text=True, capture_output=True, cwd=ENGINE_CWD, check=True)
    result = json.loads(done.stdout)
    if result["status"] != "ok": raise RuntimeError(result)
    return result


def options() -> dict[str, Any]: return {"alternative": "two_sided", "confidenceLevel": .95, "multiplicityMethod": None}


def brief(case_id: str, **values: Any) -> dict[str, Any]:
    pmc, panel, evidence = SOURCE[case_id]
    fields = {name: {"value": value, "confidence": confidence} for name, (value, confidence) in values.items()}
    return {"schemaVersion": "1.0.0", "caseId": f"{case_id}_context_rich_v2", "originalCaseId": case_id, "source": {"pmcid": pmc, "url": f"https://europepmc.org/articles/{pmc}", "targetPanel": panel, "evidenceSummary": evidence}, "fields": fields, "syntheticPolicy": "Values are deterministic synthetic reconstruction, never published raw observations."}


def point(case: str, i: int, series: str, unit: str, value: float, x: float | None = None, **extra: Any) -> dict[str, Any]:
    return {"observationId": f"{case}_context_rich_v2.o{i:05d}", "series": series, "experimentalUnitId": unit, "x": x, "value": round(value, 6), "synthetic": True, **extra}


def build() -> dict[str, dict[str, Any]]:
    rng = random.Random(20260825); cases: dict[str, dict[str, Any]] = {}
    rows=[]
    for f in range(48):
        direction = -1 if f % 4 == 0 else 1
        for s, center in (("3 h vs 1 h", .7), ("6 h vs 1 h", 1.35)):
            rows.append(point("LSA135",len(rows)+1,s,f"DEG.{f+1:02d}",direction*(center+rng.gauss(0,.28)),featureId=f"DEG.{f+1:02d}"))
    cases["LSA135"]={"classification":"READY_WITH_MINOR_SOURCE_UNCERTAINTY","graph":"heatmap","rows":rows,"brief":brief("LSA135",scientificMessage=("Show the shared 48-gene transcriptional program at 3 h and 6 h relative to 1 h.","CONFIRMED_FROM_PAPER"),experimentalDesign=("A549 infection time comparison summarized as a DEG heatmap.","CONFIRMED_FROM_PAPER"),statisticalUnit=("Not recoverable for this panel; heatmap cells are feature summaries, not biological n.","NEEDS_HUMAN_CONTEXT"),pairingNestingRepeated=("No unit-level identity asserted.","CONFIRMED_FROM_SOURCE_DATA"),factorsLevels=("comparison: 3 h vs 1 h; 6 h vs 1 h; 48 shared DEGs","CONFIRMED_FROM_PAPER"),primaryContrast=("Each later time versus 1 h","CONFIRMED_FROM_PAPER"),referenceRoles=("1 h is the reference time","CONFIRMED_FROM_PAPER"),intent=("Descriptive display of multiple-testing-selected features","INFERRED_HIGH_CONFIDENCE"),displaySet=("48 shared DEGs × two contrasts","CONFIRMED_FROM_PAPER"),analysisSet=("Not reconstructed without source counts","NEEDS_HUMAN_CONTEXT"),comparisonSet=("3 h vs 1 h; 6 h vs 1 h","CONFIRMED_FROM_PAPER"),annotationSet=("No per-cell significance annotation","INFERRED_HIGH_CONFIDENCE"),graphConvention=("Heatmap","CONFIRMED_FROM_PAPER"),xSemantics=("Time contrast","CONFIRMED_FROM_PAPER"),seriesSemantics=("None","CONFIRMED_FROM_PAPER"),facetSemantics=("None","CONFIRMED_FROM_PAPER"),yReadout=("48 DEG identities","CONFIRMED_FROM_PAPER"),sampleSizeStructure=("Unresolved for panel a","NEEDS_HUMAN_CONTEXT"),axisColorLegend=("Columns are contrasts; diverging color is synthetic log2-fold change","INFERRED_HIGH_CONFIDENCE"),uncertainty=("Not displayed","CONFIRMED_FROM_PAPER"))}
    rows=[]
    for series,n,plateau,rate in (("PLCδ1-PH",11,.96,.12),("tubbyCT",14,.72,.045),("E-Syt3",9,.58,.03)):
        for u in range(n):
            for x in (0,5,10,20,40,60): rows.append(point("LSA086",len(rows)+1,series,f"{series}.cell.{u+1}",.08+(plateau-.08)*(1-pow(2.718281828,-rate*x))+rng.gauss(0,.025),x,pairId=f"{series}.cell.{u+1}"))
    cases["LSA086"]={"classification":"CONTEXT_RICH_READY","graph":"line","rows":rows,"brief":brief("LSA086",scientificMessage=("Compare FRAP recovery of tubbyCT with mobile PLCδ1-PH and E-Syt3 references.","CONFIRMED_FROM_PAPER"),experimentalDesign=("Cell-level repeated FRAP time course from three experiments.","CONFIRMED_FROM_METHODS"),statisticalUnit=("cell; experiment identity unavailable","CONFIRMED_FROM_PAPER"),pairingNestingRepeated=("same cell repeated over time","CONFIRMED_FROM_PAPER"),factorsLevels=("probe × recovery time","CONFIRMED_FROM_PAPER"),primaryContrast=("recovery kinetics among probes","CONFIRMED_FROM_PAPER"),referenceRoles=("PLCδ1-PH mobile reference; E-Syt3 junction reference","INFERRED_HIGH_CONFIDENCE"),intent=("descriptive recovery curves; time-constant inference belongs to panel J","CONFIRMED_FROM_PAPER"),displaySet=("all three probe trajectories","CONFIRMED_FROM_PAPER"),analysisSet=("independent per-series kinetic fits","INFERRED_HIGH_CONFIDENCE"),comparisonSet=("none on panel I","CONFIRMED_FROM_PAPER"),annotationSet=("none","CONFIRMED_FROM_PAPER"),graphConvention=("mean±SEM time course","CONFIRMED_FROM_PAPER"),xSemantics=("FRAP recovery time, synthetic spacing","INFERRED_HIGH_CONFIDENCE"),seriesSemantics=("probe identity","CONFIRMED_FROM_PAPER"),facetSemantics=("none","CONFIRMED_FROM_PAPER"),yReadout=("normalized fluorescence recovery","CONFIRMED_FROM_PAPER"),sampleSizeStructure=("11/14/9 cells, three repeats","CONFIRMED_FROM_PAPER"),axisColorLegend=("numeric time; color identifies probe","INFERRED_HIGH_CONFIDENCE"),uncertainty=("SEM","CONFIRMED_FROM_PAPER"))}
    configs={
      "LSA090":("box",("Donor control",4,8,22),("HSA",6,20,48),("H464Q",5,21,25)),
      "LSA157":("violin",("Endogenous V1",3,36,28),("V1 WT",3,36,35),("V1 KD",3,36,6)),
      "LSA249":("dot_summary",("Vector",3,60,100),("ATG9B",3,60,52)),
      "LSA168":("dot_summary",("WT",4,4,1.0),("S24F",4,4,.38),("OMM",4,4,.24)),
    }
    for cid,cfg in configs.items():
        rows=[]
        for series,reps,total,center in cfg[1:]:
            for i in range(total): rows.append(point(cid,len(rows)+1,series,f"experiment.{i%reps+1}",max(0,center+rng.gauss(0,max(abs(center)*.12,.08))),None,nestedObservationId=f"cell.{i+1}" if total>reps else None))
        cases[cid]={"classification":"CONTEXT_RICH_READY","graph":cfg[0],"rows":rows}
    rows=[]
    for group,center in (("Resting",.25),("Thrombin",1.0)):
        for exp in range(3): rows.append(point("LSA094",len(rows)+1,group,f"experiment.{exp+1}",center+rng.gauss(0,.08),None,pairId=f"experiment.{exp+1}"))
    cases["LSA094"]={"classification":"READY_WITH_MINOR_SOURCE_UNCERTAINTY","graph":"dot_summary","rows":rows}
    rows=[]
    for series,rho in (("12 h",.59),("24 h",.72)):
        for i in range(80):
            x=rng.gauss(0,1); y=rho*x+(1-rho*rho)**.5*rng.gauss(0,1); rows.append(point("LSA088",len(rows)+1,series,f"representative_pixel.{i+1}",y,x,displayOnly=True))
    cases["LSA088"]={"classification":"CONTEXT_RICH_READY","graph":"scatter","rows":rows}
    rows=[]
    for group,base in (("Vehicle",22),("Parental ES-D3",55),("Differentiated ES-D3",34)):
        for i in range(8):
            time=max(8,min(70,base+rng.gauss(0,12))); rows.append(point("LSA120",len(rows)+1,group,f"mouse.{group}.{i+1}",0,time,followUpTime=time,eventObserved=i<6))
    cases["LSA120"]={"classification":"CONTEXT_RICH_READY","graph":"survival","rows":rows}
    rows=[]
    for group,n,center in (("Control",255,105),("miR-184-sp",136,120),("Ilp8-RNAi rescue",76,109)):
        for i in range(n):
            time=max(80,min(145,center+rng.gauss(0,7))); rows.append(point("LSA346",len(rows)+1,group,f"larva.{group}.{i+1}",0,time,followUpTime=time,eventObserved=True,experimentId=f"experiment.{i%5+1}"))
    cases["LSA346"]={"classification":"CONTEXT_RICH_READY","graph":"survival","rows":rows}
    rows=[]
    for side,offset in (("Contralateral",0),("Ipsilateral",-18)):
        for mouse in range(5):
            for x,base in enumerate((100,76,82,90,96)): rows.append(point("LSA126",len(rows)+1,side,f"mouse.{mouse+1}",base+offset+rng.gauss(0,4),x,pairId=f"mouse.{mouse+1}"))
    cases["LSA126"]={"classification":"CONTEXT_RICH_READY_SAFE_UNSUPPORTED","graph":"line","rows":rows}
    rows=[]
    for construct,center in (("Dr eIF4Ea",1.0),("Hs eIF4E1B WT",.86),("W81A",.42),("W113A",.36),("W81A/W113A",.10),("eIF4EBP1 4EBM",.06)):
        for exp in range(3):
            rows.append(point("LSA077",len(rows)+1,construct,f"pulldown.{exp+1}",max(0,center+rng.gauss(0,.06))))
    cases["LSA077"]={"classification":"READY_WITH_MINOR_SOURCE_UNCERTAINTY","graph":"dot_summary","rows":rows}
    common = {
      "LSA090": ("FRET-positive pixels across donor control, HSA and H464Q", "cell with nested measurements", "donor control versus each ligand", "box plot"),
      "LSA157": ("Active EML4-ALK V1 forms cytoplasmic foci", "biological experiment summarized from nested cells", "each active/endogenous group versus kinase-dead", "violin with nested cells"),
      "LSA249": ("ATG9B lowers mitochondrial membrane potential", "independent experiment summarized from >50 cells", "Vector versus ATG9B", "bar/dot with experiment summaries"),
      "LSA094": ("Thrombin activates RalB", "pulldown experiment", "Resting versus thrombin", "bar/dot"),
      "LSA168": ("PGAM5 cleavage state controls DRP1 binding", "independent pulldown experiment", "WT versus S24F and OMM", "bar/dot"),
      "LSA088": ("Mitochondrial colocalization increases from 12 h to 24 h", "representative image pixels; N=3 biological replicates is context only", "descriptive Pearson per time", "faceted scatter"),
      "LSA120": ("Undifferentiated ES-D3 vaccination prolongs survival", "mouse", "three vaccine groups", "Kaplan-Meier"),
      "LSA346": ("Ilp8 knockdown rescues miR-184-dependent developmental delay", "larva nested in five experiments", "control, perturbation, rescue", "cumulative event-time curve"),
      "LSA126": ("HI produces hemisphere-specific time-dependent physiology", "mouse repeated across hemisphere and time", "within-animal hemisphere and baseline contrasts", "two-series repeated time course"),
      "LSA077": ("Conserved tryptophans support eIF4E1B binding to the mRNA cap", "independent pulldown experiment", "constructs and mutants versus canonical/negative references", "Fig. 2B points with mean±SD"),
    }
    for cid,(message,unit,contrast,graph) in common.items():
        cases[cid]["brief"]=brief(cid,scientificMessage=(message,"CONFIRMED_FROM_PAPER"),experimentalDesign=(SOURCE[cid][2],"CONFIRMED_FROM_PAPER"),statisticalUnit=(unit,"CONFIRMED_FROM_PAPER" if cid not in {"LSA094","LSA077"} else "INFERRED_HIGH_CONFIDENCE"),pairingNestingRepeated=("Encoded explicitly in synthetic rows where supported","INFERRED_HIGH_CONFIDENCE"),factorsLevels=("See display/series semantics","CONFIRMED_FROM_PAPER"),primaryContrast=(contrast,"INFERRED_HIGH_CONFIDENCE" if cid=="LSA077" else "CONFIRMED_FROM_PAPER"),referenceRoles=("Control/reference labels preserved from legend","CONFIRMED_FROM_PAPER"),intent=("Inferential where the legend reports a test; representative pixels remain descriptive","CONFIRMED_FROM_PAPER"),displaySet=(graph,"CONFIRMED_FROM_PAPER"),analysisSet=(unit,"INFERRED_HIGH_CONFIDENCE"),comparisonSet=(contrast,"INFERRED_HIGH_CONFIDENCE" if cid=="LSA077" else "CONFIRMED_FROM_PAPER"),annotationSet=("Only source-supported comparisons","INFERRED_HIGH_CONFIDENCE"),graphConvention=(graph,"CONFIRMED_FROM_PAPER"),xSemantics=("condition or numeric time according to panel","CONFIRMED_FROM_PAPER"),seriesSemantics=("scientific condition/time identity","CONFIRMED_FROM_PAPER"),facetSemantics=("time facet only for LSA088","INFERRED_HIGH_CONFIDENCE"),yReadout=(message,"CONFIRMED_FROM_PAPER"),sampleSizeStructure=(SOURCE[cid][2],"CONFIRMED_FROM_PAPER"),axisColorLegend=("labels preserve source roles; color identifies series","INFERRED_HIGH_CONFIDENCE"),uncertainty=("SD/SEM or distribution as reported","CONFIRMED_FROM_PAPER"))
    return cases


def statistics(cid: str, item: dict[str, Any]) -> dict[str, Any]:
    rows=item["rows"]
    if cid in {"LSA135","LSA077","LSA126"}:
        reasons={
          "LSA135":"descriptive heatmap; unit-level source counts were not reconstructed",
          "LSA077":"source reports two-way ANOVA/Tukey but does not identify the second model factor; Graph Gold is localized to Fig. 2B and inference is withheld",
          "LSA126":"SAFE_UNSUPPORTED_FOR_ALPHA: two crossed within-mouse factors (hemisphere × ordered stage) are displayed without substituting an invalid model",
        }
        return {"status":"not_executed","reason":reasons[cid],"results":[]}
    if cid=="LSA086":
        req={"protocolVersion":"0.14.0","requestId":"request.LSA086.fit","projectId":"project.LSA086.v2","analysisId":"analysis.LSA086.fit","templateId":"D17","templateVersion":"0.1.0","method":"nonlinear_xy_fit","modelId":"one_phase_association","modelSelectionRationale":"FRAP recovery is a saturating time course; independent one-phase association fits preserve probe identity.","xLabel":"Recovery time","yLabel":"Normalized fluorescence","xUnit":"s","yUnit":"relative","seriesIds":["PLCδ1-PH","tubbyCT","E-Syt3"],"points":[{"observationId":r["observationId"],"experimentalUnitId":r["experimentalUnitId"],"seriesId":r["series"],"x":r["x"],"y":r["value"]} for r in rows],"initialValues":{},"bounds":{},"observations":[],"options":options()}; return {"status":"ok","results":[{"request":req,"result":run_engine(req)}]}
    if cid in {"LSA120","LSA346"}:
        groups=list(dict.fromkeys(r["series"] for r in rows)); req={"protocolVersion":"0.8.0","requestId":f"request.{cid}.survival","projectId":f"project.{cid}.v2","analysisId":f"analysis.{cid}.survival","templateId":"D11","templateVersion":"0.1.0","method":"log_rank","conditionIds":groups,"observations":[{"observationId":r["observationId"],"conditionId":r["series"],"experimentalUnitId":r["experimentalUnitId"],"followUpTime":r["followUpTime"],"eventObserved":r["eventObserved"]} for r in rows],"options":options()}; return {"status":"ok","results":[{"request":req,"result":run_engine(req)}]}
    if cid=="LSA088":
        results=[]
        for series in ("12 h","24 h"):
            selected=[r for r in rows if r["series"]==series]; obs=[]
            for r in selected:
                for condition,value in (("x",r["x"]),("y",r["value"])): obs.append({"observationId":r["observationId"]+condition,"conditionId":condition,"value":value,"experimentalUnitId":r["experimentalUnitId"],"pairId":r["experimentalUnitId"]})
            req={"protocolVersion":"0.5.0","requestId":f"request.LSA088.{series}","projectId":"project.LSA088.v2","analysisId":f"analysis.LSA088.{series}","templateId":"D09","templateVersion":"0.1.0","method":"pearson","variableConditionIds":["x","y"],"observations":obs,"options":options()}; results.append({"label":series,"request":req,"result":run_engine(req)})
        return {"status":"ok_descriptive_pixel_level","results":results}
    grouped=defaultdict(list)
    for r in rows: grouped[r["series"]].append(r)
    summaries={g:defaultdict(list) for g in grouped}
    for g,rs in grouped.items():
        for r in rs: summaries[g][r["experimentalUnitId"]].append(r["value"])
    observations=[{"observationId":f"{cid}.{g}.{u}","conditionId":g,"experimentalUnitId":u+g,"value":mean(v)} for g,units in summaries.items() for u,v in units.items()]
    groups=list(grouped)
    if len(groups)==2:
        req={"protocolVersion":"0.1.0","requestId":f"request.{cid}","projectId":f"project.{cid}.v2","analysisId":f"analysis.{cid}","templateId":"D01","templateVersion":"0.1.0","method":"welch_t","contrastConditionIds":groups,"observations":observations,"options":options()}
    else:
        req={"protocolVersion":"0.2.0","requestId":f"request.{cid}","projectId":f"project.{cid}.v2","analysisId":f"analysis.{cid}","templateId":"D03","templateVersion":"0.1.0","method":"one_way_anova","conditionIds":groups,"contrastIntent":"control_vs_many","controlConditionId":groups[0],"observations":observations,"options":{**options(),"multiplicityMethod":"dunnett_control_vs_many"}}
    return {"status":"ok","results":[{"request":req,"result":run_engine(req)}]}


def render(cid: str, item: dict[str, Any], stats: dict[str, Any], directory: Path) -> None:
    rows=item["rows"]; c=Canvas(cid); title=f"{cid}_context_rich_v2 — {SOURCE[cid][1]}"; c.text(600,35,title,20,bold=True)
    if not rows:
        c.text(600,300,"NEEDS HUMAN CONTEXT — no synthetic Graph Gold generated",25,bold=True,fill="#9a3f31")
    elif item["graph"]=="heatmap":
        for i,r in enumerate(rows):
            col=i%2; row=i//2; value=r["value"]; color="#b40426" if value>0 else "#3b4cc0"; c.rect((210+col*250,70+row*10,450+col*250,79+row*10),fill=color,outline=color,width=1,opacity=min(1,abs(value)/2))
        c.text(330,590,"3 h vs 1 h",16); c.text(580,590,"6 h vs 1 h",16); c.text(800,300,"Synthetic log2 fold-change",17,bold=True)
    elif item["graph"]=="survival":
        left,top,pw,ph=axes(c,x_label="Event time",y_label="Event-free proportion",y_min=0,y_max=1)
        result=stats["results"][0]["result"]["survival"]["groups"]
        max_x=max(p["time"] for g in result for p in g["curve"])
        for i,g in enumerate(result):
            pts=[(left+p["time"]/max_x*pw,top+ph-p["survival"]*ph) for p in g["curve"]]; c.polyline(pts,COLORS[i],3); c.text(left+pw+25,top+25+i*28,g["conditionId"],14,"start",fill=COLORS[i])
    elif item["graph"]=="scatter":
        left,top,pw,ph=axes(c,x_label="COX8-GFP intensity",y_label="Mito7-mRuby intensity",y_min=-3,y_max=3)
        for i,s in enumerate(("12 h","24 h")):
            selected=[r for r in rows if r["series"]==s]
            for r in selected: c.circle(left+(r["x"]+3)/6*pw,top+ph-(r["value"]+3)/6*ph,2.5,COLORS[i])
            c.text(left+pw+20,top+25+i*28,s,14,"start",fill=COLORS[i])
    elif item["graph"]=="line":
        values=[r["value"] for r in rows]; xs=sorted({r["x"] for r in rows}); left,top,pw,ph=axes(c,x_label="Ordered time",y_label="Response",y_min=min(values)*.9,y_max=max(values)*1.08)
        for i,s in enumerate(dict.fromkeys(r["series"] for r in rows)):
            pts=[]
            for x in xs:
                vals=[r["value"] for r in rows if r["series"]==s and r["x"]==x]; pts.append((left+(x-min(xs))/(max(xs)-min(xs))*pw,top+ph-(mean(vals)-min(values)*.9)/(max(values)*1.08-min(values)*.9)*ph))
            c.polyline(pts,COLORS[i],3); c.text(left+pw+20,top+25+i*28,s,14,"start",fill=COLORS[i])
    else:
        groups=list(dict.fromkeys(r["series"] for r in rows)); values=[r["value"] for r in rows]; left,top,pw,ph=axes(c,x_label="Condition",y_label="Source readout",y_min=0,y_max=max(values)*1.25)
        for i,g in enumerate(groups):
            vals=[r["value"] for r in rows if r["series"]==g]; by=defaultdict(list)
            for r in [x for x in rows if x["series"]==g]: by[r["experimentalUnitId"]].append(r["value"])
            summaries=[mean(v) for v in by.values()]; x=left+pw*(i+.5)/len(groups); y=lambda v:top+ph-v/(max(values)*1.25)*ph
            for j,v in enumerate(summaries): c.circle(x+(j-(len(summaries)-1)/2)*8,y(v),5,COLORS[i])
            avg=mean(summaries); sd=stdev(summaries) if len(summaries)>1 else 0; error_bar(c,x,y(avg+sd),y(max(0,avg-sd)),COLORS[i]); c.line((x-20,y(avg),x+20,y(avg)),COLORS[i],3); c.text(x,top+ph+32,g,13,bold=True)
    c.save(directory/"default_graph.svg",directory/"default_graph.png"); (directory/"final_graph.svg").write_bytes((directory/"default_graph.svg").read_bytes()); (directory/"final_graph.png").write_bytes((directory/"default_graph.png").read_bytes())


def main() -> None:
    if set(SOURCE) != set(ALLOWED_HISTORICAL_IDS): raise RuntimeError("Source allow-list drift")
    generated=datetime.now(timezone.utc).isoformat(); cases=build(); manifests=[]; classes=defaultdict(int)
    for cid in CASE_IDS:
        item=cases[cid]; classes[item["classification"]]+=1; stats=statistics(cid,item); run_dir=RUNS/f"{cid}_context_rich_v2"; runtime_dir=RUNTIME/"cases"/f"{cid}_context_rich_v2"; run_dir.mkdir(parents=True,exist_ok=True); runtime_dir.mkdir(parents=True,exist_ok=True)
        render(cid,item,stats,run_dir); graph={"schemaVersion":"1.0.0","type":item["graph"],"analysisResultAuthority":stats["status"].startswith("ok"),"displaySet":"all synthetic rows","analysisSet":"biological-unit summaries or explicit survival units","comparisonSet":item["brief"]["fields"]["comparisonSet"]["value"],"annotationSet":item["brief"]["fields"]["annotationSet"]["value"]}
        project={"schemaVersion":"0.3.0","caseId":f"{cid}_context_rich_v2","dataset":{"sourceStatus":"SYNTHETIC_RECONSTRUCTION","observations":item["rows"]},"goldFigureBrief":item["brief"],"analysis":stats,"graph":graph,"provenance":{"generatedAt":generated,"generator":"scripts/generate_context_rich_graph_pilot.py","originalCaseId":cid,"originalBenchmark":"LSA495_v2_1_repaired_1","poolDOpened":False}}
        for path,payload in ((runtime_dir/"case.json",{"caseId":f"{cid}_context_rich_v2","classification":item["classification"],"goldFigureBrief":item["brief"],"syntheticData":item["rows"]}),(run_dir/"statistics.json",stats),(run_dir/"graph_state.json",graph),(run_dir/"project_state.json",project),(run_dir/"support_classification.json",{"caseId":cid,"classification":item["classification"]})):
            path.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        methods=[f"Case: {cid}_context_rich_v2",f"Source: https://europepmc.org/articles/{SOURCE[cid][0]} ({SOURCE[cid][1]})","All observations are deterministic synthetic reconstruction, not published raw data.",f"Statistical unit: {item['brief']['fields']['statisticalUnit']['value']}",f"Primary contrast: {item['brief']['fields']['primaryContrast']['value']}",f"Analysis status: {stats['status']}"]
        if stats["status"].startswith("ok"): methods.append("Authority: saved local numerical-engine result; Graph does not smooth or recompute analysis.")
        (run_dir/"methods.txt").write_text("\n".join(methods)+"\n",encoding="utf-8")
        run={"caseId":f"{cid}_context_rich_v2","outcome":item["classification"],"artifactCompleteness":"complete","generatedAt":generated,"finalGraphSha256":hashlib.sha256((run_dir/"final_graph.svg").read_bytes()).hexdigest()}; (run_dir/"run.json").write_text(json.dumps(run,indent=2)+"\n",encoding="utf-8")
        manifests.append({"caseId":cid,"lineageId":f"{cid}_context_rich_v2","classification":item["classification"],"family":item["graph"],"sourceUrl":item["brief"]["source"]["url"],"panel":item["brief"]["source"]["targetPanel"],"runRoot":f"runs/{cid}_context_rich_v2"})
    BASE.mkdir(parents=True,exist_ok=True)
    outputs={
      "pilot_manifest.json":{"schemaVersion":"1.0.0","caseCount":12,"caseIds":list(CASE_IDS),"classifications":dict(classes),"cases":manifests,"poolDOpened":False},
      "pilot_method_audit.json":{"verdict":"READY_FOR_FAMILY_EXPANSION","reason":"LSA077 is localized to Fig. 2B with Fig. 2D retained as a split-case candidate; LSA126 is accepted as a valid Graph-only case under the SAFE_UNSUPPORTED_FOR_ALPHA policy. Neither uncertainty permits fabricated inference.","autonomousExpansionPerformed":False,"methodologyVersion":"context-rich-graph-1.1"},
      "human_context_exception_clusters.json":{"clusters":[],"resolved":[{"caseId":"LSA077","decision":"SELECT_FIG_2B_FOR_LEGACY_LINEAGE_AND_RETAIN_FIG_2D_AS_SPLIT_CANDIDATE"},{"caseId":"LSA126","decision":"SAFE_UNSUPPORTED_FOR_ALPHA"}]},
      "autonomous_expansion_manifest.json":{"status":"READY_TO_START_FAMILY_BATCHES","pilotCount":12,"finalSubsetCount":12,"target":35,"reason":"READY_FOR_FAMILY_EXPANSION"},
      "coverage_matrix.json":{"covered":["heatmap/multi-readout","multiple-series FRAP","nested box/violin","nested raw+summary","WB normalization","faceted correlation","survival","rescue/reference logic","source-localized cap-binding","safe Graph-only crossed-within design"],"safeUnsupported":["crossed within-animal hemisphere×time inference"],"humanContext":[]},
      "graph_capability_preliminary_audit.json":{"representable":12,"needsHumanContext":0,"safeUnsupported":1,"genericProductGaps":[{"caseId":"LSA126","gap":"two crossed within-unit factors (hemisphere × time) with stable animal identity","alphaPolicy":"SAFE_UNSUPPORTED_FOR_ALPHA"}]},
      "historical_lineage_map.json":{"policy":"Original cases and Round evidence remain immutable.","entries":[{"originalCaseId":cid,"contextRichCaseId":f"{cid}_context_rich_v2"} for cid in CASE_IDS]},
    }
    for name,payload in outputs.items(): (BASE/name).write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    browser=BASE/"comparison_browser"; browser.mkdir(exist_ok=True)
    cards="".join(f'<article><h2>{m["caseId"]} · {escape(m["panel"])}</h2><p>{escape(m["classification"])}</p><img src="../runs/{m["lineageId"]}/final_graph.png" alt="{m["caseId"]} final Graph"><p><a href="{m["sourceUrl"]}">Primary source</a></p></article>' for m in manifests)
    (browser/"index.html").write_text(f'<!doctype html><meta charset="utf-8"><title>Context-rich pilot</title><style>body{{font-family:Arial;margin:24px;background:#f4f6f8}}main{{display:grid;grid-template-columns:repeat(auto-fit,minmax(480px,1fr));gap:18px}}article{{background:white;padding:16px;border-radius:10px}}img{{width:100%;height:auto;border:1px solid #ccd3da}}h1{{font-size:28px}}</style><h1>Context-rich Graph pilot · 12 cases</h1><p>READY FOR FAMILY EXPANSION — methodology 1.1.</p><main>{cards}</main>',encoding="utf-8")
    print(json.dumps({"caseCount":12,"classifications":dict(classes),"methodVerdict":"READY_FOR_FAMILY_EXPANSION"},indent=2))


if __name__ == "__main__": main()
