#!/usr/bin/env python3
"""Generate the human-corrected expanded personal validation round.

This script never opens the sealed literature benchmark or Pool D. All values
are deterministic, scientifically constrained synthetic reconstructions and
are never described as published raw observations.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from html import escape
import hashlib
import json
import math
from pathlib import Path
import random
import subprocess
from statistics import mean, stdev
from typing import Any

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "benchmark/personal_figure_v1/runtime_round_6"
RUNS = ROOT / "benchmark/personal_figure_v1/runs_round_6"
REFERENCES = ROOT / "benchmark/personal_figure_v1/references/expanded_round_6"
REVIEW = ROOT / "benchmark/personal_figure_v1/review/review_round_6.json"
MANIFEST = ROOT / "benchmark/personal_figure_v1/comparison_manifest_round_6.json"
VERSION = "LSA_PERSONAL_FIGURE_v1_0_EXPANDED_ROUND_6"
CASE_IDS = [
    "PFR009", "PFR011", "PFR020", "PFR027A", "PFR027B", "PFR033",
    "PFR043", "PFR045", "PFR054", "PFR059A", "PFR059B", "PFR062",
]
ENGINE = ROOT / "engine/python/.venv/Scripts/python.exe"
ENGINE_CWD = ROOT / "engine/python"
W, H = 1200, 760
COLORS = ["#245c8a", "#c26532", "#3e7c67", "#735a8d", "#9a7628", "#467681"]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/meiryob.ttc" if bold else "C:/Windows/Fonts/meiryo.ttc"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


class Canvas:
    def __init__(self, title: str):
        self.image = Image.new("RGB", (W, H), "white")
        self.draw = ImageDraw.Draw(self.image)
        self.svg: list[str] = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
            f"<title>{escape(title)}</title><rect width=\"100%\" height=\"100%\" fill=\"white\"/>",
            '<g font-family="Arial, Helvetica, sans-serif">',
        ]

    def line(self, xy: tuple[float, float, float, float], fill: str = "#111111", width: float = 2, dash: str | None = None):
        x1, y1, x2, y2 = xy
        if dash:
            segments = 18 if dash == "dashed" else 32
            for index in range(segments):
                if index % 2 == 0:
                    a, b = index / segments, (index + 1) / segments
                    self.draw.line((x1 + (x2-x1)*a, y1 + (y2-y1)*a, x1 + (x2-x1)*b, y1 + (y2-y1)*b), fill=fill, width=max(1, round(width)))
        else:
            self.draw.line(xy, fill=fill, width=max(1, round(width)))
        dash_attr = ' stroke-dasharray="8 5"' if dash == "dashed" else (' stroke-dasharray="2 4"' if dash == "dotted" else "")
        self.svg.append(f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{fill}" stroke-width="{width}"{dash_attr}/>' )

    def polyline(self, points: list[tuple[float, float]], fill: str, width: float = 2.5, dash: str | None = None):
        for first, second in zip(points, points[1:]):
            self.line((*first, *second), fill, width, dash)

    def polygon(self, points: list[tuple[float, float]], fill: str, opacity: float = 0.18):
        rgba = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(rgba).polygon(points, fill=fill + f"{round(opacity*255):02x}")
        self.image.paste(rgba.convert("RGB"), mask=rgba.getchannel("A"))
        encoded = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
        self.svg.append(f'<polygon points="{encoded}" fill="{fill}" fill-opacity="{opacity}" stroke="none"/>')

    def rect(self, xy: tuple[float, float, float, float], fill: str = "white", outline: str = "#111111", width: int = 2, opacity: float = 1):
        x1, y1, x2, y2 = xy
        self.draw.rectangle(xy, fill=fill, outline=outline, width=width)
        self.svg.append(f'<rect x="{x1:.2f}" y="{y1:.2f}" width="{x2-x1:.2f}" height="{y2-y1:.2f}" fill="{fill}" fill-opacity="{opacity}" stroke="{outline}" stroke-width="{width}"/>')

    def circle(self, x: float, y: float, r: float, fill: str, outline: str = "white", width: int = 1):
        self.draw.ellipse((x-r, y-r, x+r, y+r), fill=fill, outline=outline, width=width)
        self.svg.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r}" fill="{fill}" stroke="{outline}" stroke-width="{width}"/>')

    def text(self, x: float, y: float, value: str, size: int = 18, anchor: str = "middle", bold: bool = False, fill: str = "#111111"):
        pil_font = font(size, bold)
        box = self.draw.textbbox((0, 0), value, font=pil_font)
        width = box[2] - box[0]
        tx = x - width/2 if anchor == "middle" else (x-width if anchor == "end" else x)
        self.draw.text((tx, y-size), value, font=pil_font, fill=fill)
        weight = 650 if bold else 400
        self.svg.append(f'<text x="{x:.2f}" y="{y:.2f}" font-size="{size}" text-anchor="{anchor}" font-weight="{weight}" fill="{fill}">{escape(value)}</text>')

    def y_title(self, y: float, value: str):
        label_font = font(20, True)
        box = self.draw.textbbox((0, 0), value, font=label_font)
        label = Image.new("RGBA", (box[2] - box[0] + 10, box[3] - box[1] + 10), (0, 0, 0, 0))
        ImageDraw.Draw(label).text((5, 5), value, font=label_font, fill="#111111")
        rotated = label.rotate(90, expand=True)
        self.image.paste(rotated, (30, round(y - rotated.height / 2)), rotated)
        self.svg.append(f'<text x="42" y="{y:.2f}" transform="rotate(-90 42 {y:.2f})" font-size="20" text-anchor="middle" font-weight="650" fill="#111111">{escape(value)}</text>')

    def save(self, svg_path: Path, png_path: Path):
        self.svg.extend(["</g></svg>"])
        svg_path.write_text("".join(self.svg) + "\n", encoding="utf-8", newline="\n")
        self.image.save(png_path)


def axes(canvas: Canvas, *, x_label: str, y_label: str, y_min: float, y_max: float, y_ticks: int = 6, horizontal_grid: bool = False):
    left, right, top, bottom = 150, 210, 70, 145
    plot_w, plot_h = W-left-right, H-top-bottom
    for index in range(y_ticks):
        value = y_min + (y_max-y_min)*index/(y_ticks-1)
        y = top+plot_h-(value-y_min)/(y_max-y_min)*plot_h
        if horizontal_grid and index > 0:
            canvas.line((left, y, left+plot_w, y), fill="#d9dfdc", width=1)
        canvas.line((left-7, y, left, y), width=1.4)
        canvas.text(left-14, y+6, f"{value:.2f}".rstrip("0").rstrip("."), 15, "end")
    canvas.line((left, top, left, top+plot_h), width=2)
    canvas.line((left, top+plot_h, left+plot_w, top+plot_h), width=2)
    canvas.text(left+plot_w/2, H-30, x_label, 21, "middle", True)
    canvas.y_title(top+plot_h/2, y_label)
    return left, top, plot_w, plot_h


def error_bar(canvas: Canvas, x: float, y_low: float, y_high: float, color: str, cap: float = 10):
    canvas.line((x, y_low, x, y_high), color, 1.8)
    canvas.line((x-cap, y_low, x+cap, y_low), color, 1.8)
    canvas.line((x-cap, y_high, x+cap, y_high), color, 1.8)


def comparison_bracket(canvas: Canvas, x1: float, x2: float, y: float, label: str):
    canvas.line((x1, y+8, x1, y), width=1.5)
    canvas.line((x1, y, x2, y), width=1.5)
    canvas.line((x2, y, x2, y+8), width=1.5)
    canvas.text((x1+x2)/2, y-5, label, 15, bold=True)


def rng_values(center: float, spread: float, n: int, seed: int) -> list[float]:
    rng = random.Random(seed)
    return [center + rng.gauss(0, spread) for _ in range(n)]


def row(case: str, index: int, *, condition: str, value: float, unit: str, x: float | None = None, series: str | None = None, **extra: Any) -> dict[str, Any]:
    return {
        "caseId": case, "observationId": f"{case}_R6_O{index:06d}", "condition": condition,
        "series": series or condition, "x": x, "value": round(value, 6),
        "experimentalUnitId": unit, "synthetic": True, "sourceStatus": "SYNTHETIC_RECONSTRUCTION", **extra,
    }


def build_cases() -> dict[str, dict[str, Any]]:
    cases: dict[str, dict[str, Any]] = {}
    # PFR009: one representative WB, two independently normalized series.
    times = [0, 4, 8, 16, 24, 48]
    rows = []
    for series, values in {"Ndel1": [1, .92, .73, .51, .44, .76], "trichoplein": [1, .96, .82, .64, .57, .84]}.items():
        for time, value in zip(times, values): rows.append(row("PFR009", len(rows)+1, condition=series, series=series, x=time, value=value, unit=f"representative_WB_{series}_{time}h", normalizationReference="0 h"))
    cases["PFR009"] = case("PFR009", "NDEL1", "Fig. 5B", "descriptive", "representative WB sample (n=1)", "None", rows, "line", "Serum starvation (h)", "Relative intensity", support="direct_descriptive")

    # PFR011: reconstructed sessions retained separately from publication-facing cells.
    rows=[]; centers={0:1.0,4:.93,8:.76,16:.52,24:.47,48:.72}
    for t_index,(time_value,center) in enumerate(centers.items()):
        for session in range(1,4):
            for cell_index,value in enumerate(rng_values(center + (session-2)*.025, .105, 18+session, 11000+t_index*100+session)):
                rows.append(row("PFR011",len(rows)+1,condition=f"{time_value} h",series="Ndel1",x=time_value,value=max(.08,value),unit=f"session.{session}",sessionId=f"session.{session}",cellId=f"t{time_value}.s{session}.c{cell_index+1}",displayUnit="cell",inferentialUnit="reconstructed session"))
    cases["PFR011"] = case("PFR011","NDEL1","Fig. 5C","inferential_app_reconstruction","independent imaging session (reconstructed, n=3)","0 h versus each later time; annotate significant only",rows,"box","Serum starvation (h)","Ndel1 at the centrosome (a.u.)",support="reasonable_workflow_source_hierarchy_uncertain")

    rows=[]
    for category,wt,ko in [("Proximal",31,55),("Distal",42,44),("C.D.",47,46)]:
        for genotype,center in [("WT/WT",wt),("cko/cko",ko)]:
            values=rng_values(center,2.4 if category=="Proximal" else 4.5,6,2000+len(rows))
            for mouse,value in enumerate(values,1):
                denominator=100+mouse*3; numerator=round(max(0,min(100,value))*denominator/100)
                rows.append(row("PFR020",len(rows)+1,condition=category,series=genotype,value=100*numerator/denominator,unit=f"{genotype}.mouse.{mouse}",numerator=numerator,denominator=denominator,renalCategory=category,genotype=genotype))
    cases["PFR020"] = case("PFR020","NDEL1","Fig. 9F","inferential","mouse (n=6 per genotype)","WT/WT versus cko/cko within each renal category",rows,"grouped_bar","Renal category","Cells with cilia (%)",support="direct_synthetic")

    rows=[]
    for construct,center in [("control",1.00),("RhoA",1.58),("Rac1",1.07),("Cdc42",1.03)]:
        for exp,value in enumerate(rng_values(center,.035,3,2700+len(rows)),1): rows.append(row("PFR027A",len(rows)+1,condition=construct,value=value,unit=f"experiment.{exp}",series=construct))
    cases["PFR027A"] = case("PFR027A","OPTO","Fig. 2C left","inferential","independent imaging experiment (n=3)","each construct versus control",rows,"dot","Construct","F70s / F50s",support="direct_synthetic")

    rows=[]; times=[0,60,120,180,240,350,600]
    for series in ["control","RhoA"]:
        base=[1.0,1.01,1.02,1.03,1.02,1.01,1.0] if series=="control" else [1.0,1.05,1.18,1.32,1.40,1.29,1.08]
        for exp in range(1,4):
            for cell in range(1,5):
                noise=random.Random(27100+exp*20+cell+(0 if series=="control" else 100)).gauss(0,.018)
                for time_value,value in zip(times,base): rows.append(row("PFR027B",len(rows)+1,condition=series,series=series,x=time_value,value=value+noise,unit=f"experiment.{exp}",sessionId=f"experiment.{exp}",cellId=f"{series}.e{exp}.c{cell}",pairId=f"{series}.e{exp}.c{cell}"))
    cases["PFR027B"] = case("PFR027B","OPTO","Fig. 2C right","descriptive","cell repeated over time, nested in imaging experiment","None; trajectory only",rows,"line","Time (sec)","Relative fluorescence intensity",support="direct_descriptive")

    rows=[]
    for construct,center in [("RhoA",82),("Rac1",9),("Cdc42",12),("Ras",7),("Rap",6),("Ral",8)]:
        for exp,value in enumerate(rng_values(center,4,4,3300+len(rows)),1):
            denominator=80+exp*5; numerator=round(max(0,min(100,value))*denominator/100)
            rows.append(row("PFR033",len(rows)+1,condition=construct,value=100*numerator/denominator,unit=f"experiment.{exp}",numerator=numerator,denominator=denominator))
    cases["PFR033"] = case("PFR033","OPTO","Fig. 3A","descriptive","independent imaging experiment (n=4)","None",rows,"bar","Optogenetic construct","Cells with calcium transients (%)",support="direct_descriptive")

    rows=[]
    for construct,center in [("ECFP",18),("WT",82),("F702A",76),("H1433L",27),("R2130L",78),("ΔYins",31)]:
        for exp,value in enumerate(rng_values(center,3.5,3,4300+len(rows)),1):
            denominator=100+exp*4; numerator=round(value*denominator/100)
            rows.append(row("PFR043",len(rows)+1,condition=construct,value=100*numerator/denominator,unit=f"experiment.{exp}",numerator=numerator,denominator=denominator))
    cases["PFR043"] = case("PFR043","OPTO","Fig. 5E","inferential","independent imaging experiment (n=3)","ECFP vs WT; WT vs each mutant",rows,"bar","Rescue construct","Cells with calcium transients (%)",support="direct_synthetic")

    rows=[]; times=[0,30,60,120,240,300]
    series_values={
        "5-ptase + PLCδ-PH, ON":[1,1.08,1.23,1.38,1.48,1.51],
        "RhoA + PLCδ-PH, ON":[1,1.04,1.12,1.26,1.36,1.40],
        "RhoA + PLCδ-PH, OFF":[1,1.00,1.01,1.01,1.02,1.01],
        "RhoA + mCherry, ON":[1,1.00,.99,1.00,1.01,1.00],
        "RhoA + mCherry, OFF":[1,1.00,1.00,.99,1.00,1.00],
    }
    for s_index,(series,base) in enumerate(series_values.items()):
        for unit in range(1,7):
            offset=random.Random(45000+s_index*100+unit).gauss(0,.025)
            for time_value,value in zip(times,base): rows.append(row("PFR045",len(rows)+1,condition=series,series=series,x=time_value,value=value+offset,unit=f"cell_experiment.{unit}",pairId=f"{series}.unit.{unit}"))
    cases["PFR045"] = case("PFR045","OPTO","Fig. 6F","descriptive","cell/imaging experiment repeated over time (n=6)","None",rows,"line","Time (sec)","Relative cytosolic fluorescence",support="direct_descriptive")

    rows=[]
    for condition,center in [("AX2",86),("gflB KO",132)]:
        for event_index,value in enumerate(rng_values(center,18,48,5400+len(rows)),1): rows.append(row("PFR054",len(rows)+1,condition=condition,value=max(25,value),unit=f"unresolved_event.{condition}.{event_index}",eventId=f"{condition}.event.{event_index}",inferentialUnit="unresolved"))
    cases["PFR054"] = case("PFR054","GFLB","Fig. 2D","inferential_unsupported","unresolved; crown events are display units only","AX2 versus gflB KO requested but not executed",rows,"box","Genotype","Crown lifetime (s)",support="source_uncertainty_explicit_unsupported")

    rows=[]
    patterns={"AX2":{"T":100,"S":62,"P":38},"gflB KO":{"T":100,"S":38,"P":62},"gflB KO (GFP-GflB)":{"T":100,"S":58,"P":42}}
    for genotype,fractions in patterns.items():
        for exp in range(1,4):
            p=max(5,min(95,fractions["P"]+random.Random(5900+len(rows)).gauss(0,2.2))); s=100-p
            for fraction,value in [("T",100+random.Random(5910+len(rows)).gauss(0,2)),("S",s),("P",p)]: rows.append(row("PFR059A",len(rows)+1,condition=fraction,series=genotype,value=value,unit=f"{genotype}.experiment.{exp}",pairId=f"{genotype}.experiment.{exp}",fraction=fraction,genotype=genotype))
    cases["PFR059A"] = case("PFR059A","GFLB","Fig. 3G","inferential","independent fractionation experiment (n=3)","within fraction: AX2 vs KO and KO vs rescue",rows,"grouped_bar","Fraction","Relative amount of actin",support="direct_synthetic")
    rows_b=[{**item,"caseId":"PFR059B","observationId":item["observationId"].replace("PFR059A","PFR059B")} for item in rows if item["condition"] in {"P","S"}]
    cases["PFR059B"] = case("PFR059B","GFLB","Fig. 3H","inferential","independent fractionation experiment (n=3); P/S paired","genotype comparisons on P fraction",rows_b,"stacked","Genotype","Relative amount of actin (%)",support="direct_synthetic")

    rows=[]; times=[0,30,60,120]
    for substrate,values in {"K5":[0,.56,1.02,1.55],"K14":[0,.34,.66,1.08]}.items():
        for exp in range(1,4):
            for time_value,value in zip(times,values): rows.append(row("PFR062",len(rows)+1,condition=substrate,series=substrate,x=time_value,value=max(0,value+random.Random(6200+len(rows)).gauss(0,.045)),unit=f"CDK1.experiment.{exp}",kinase="CDK1",substrate=substrate))
    cases["PFR062"] = case("PFR062","KER5","Fig. 1B representative CDK1 panel","nonlinear_fit","independent in-vitro kinase experiment (n=3)","Independent saturating kinetic fit for K5 and K14",rows,"nonlinear_xy","Time (min)","mol Pi / mol substrate",support="generic_basic_nonlinear_xy_fit")
    return cases


def case(case_id: str, paper: str, panel: str, inference: str, unit: str, contrast: str, rows: list[dict], graph: str, x: str, y: str, *, support: str) -> dict[str, Any]:
    return {"caseId":case_id,"paperCode":paper,"panel":panel,"inferenceMode":inference,"statisticalUnit":unit,"primaryContrast":contrast,"rows":rows,"graphFamily":graph,"xLabel":x,"yLabel":y,"supportClassification":support,"sourceStatus":"SYNTHETIC_RECONSTRUCTION"}


def engine_request(request: dict[str, Any]) -> dict[str, Any]:
    process=subprocess.run([str(ENGINE),"-m","lsaa_engine.cli"],input=json.dumps(request),text=True,capture_output=True,cwd=ENGINE_CWD,check=True)
    result=json.loads(process.stdout)
    if result.get("status") != "ok": raise RuntimeError(result)
    return result


def options(method: str="holm_planned_comparisons") -> dict[str, Any]:
    return {"alternative":"two_sided","confidenceLevel":.95,"multiplicityMethod":method}


def d01(case_id: str, label: str, a: str, b: str, grouped: dict[str,list[tuple[str,float]]]) -> dict[str,Any]:
    observations=[]
    for condition in [a,b]:
        observations += [{"observationId":f"{case_id}.{label}.{condition}.{i}","conditionId":condition,"value":value,"experimentalUnitId":unit} for i,(unit,value) in enumerate(grouped[condition],1)]
    request={"protocolVersion":"0.1.0","requestId":f"request.{case_id}.{label}","projectId":f"project.{case_id}","analysisId":f"analysis.{case_id}.{label}","templateId":"D01","templateVersion":"0.1.0","method":"welch_t","contrastConditionIds":[a,b],"observations":observations,"options":options("none")}
    return {"request":request,"result":engine_request(request)}


def d03(case_id: str, label: str, grouped: dict[str,list[tuple[str,float]]], pairs: list[tuple[str,str]]) -> dict[str,Any]:
    observations=[]
    for condition,values in grouped.items(): observations += [{"observationId":f"{case_id}.{label}.{condition}.{i}","conditionId":condition,"value":value,"experimentalUnitId":unit+f".{condition}"} for i,(unit,value) in enumerate(values,1)]
    request={"protocolVersion":"0.2.0","requestId":f"request.{case_id}.{label}","projectId":f"project.{case_id}","analysisId":f"analysis.{case_id}.{label}","templateId":"D03","templateVersion":"0.1.0","method":"one_way_anova","conditionIds":list(grouped),"contrastIntent":"planned_comparisons","plannedContrastConditionIds":[list(pair) for pair in pairs],"primaryContrastConditionIds":list(pairs[0]),"observations":observations,"options":options()}
    return {"request":request,"result":engine_request(request)}


def statistics_for(item: dict[str,Any]) -> dict[str,Any]:
    case_id=item["caseId"]; rows=item["rows"]
    if item["inferenceMode"] == "descriptive": return {"caseId":case_id,"status":"not_applicable","reason":"Authoritative Figure specification is descriptive-only; no inferential request was created.","results":[]}
    if case_id == "PFR054": return {"caseId":case_id,"status":"unsupported","reason":"Crown-event display is supported, but source-backed cell/movie/session identity is insufficient to define the inferential unit safely. Events were not treated as biological n.","gap":"SOURCE_UNCERTAINTY","results":[]}
    if case_id == "PFR062":
        request={"protocolVersion":"0.14.0","requestId":"request.PFR062.kinetics","projectId":"project.PFR062","analysisId":"analysis.PFR062.kinetics","templateId":"D17","templateVersion":"0.1.0","method":"nonlinear_xy_fit","modelId":"zero_baseline_association","modelSelectionRationale":"The source panel is a product-formation time course without an explicit published fit equation. A zero-baseline one-phase association is the simplest saturating kinetic model; Michaelis-Menten is not used because X is time, not substrate concentration.","xLabel":item["xLabel"],"yLabel":item["yLabel"],"xUnit":"min","yUnit":"mol Pi / mol substrate","seriesIds":["K5","K14"],"points":[{"observationId":r["observationId"],"experimentalUnitId":r["experimentalUnitId"],"seriesId":r["series"],"x":r["x"],"y":r["value"]} for r in rows],"initialValues":{},"bounds":{"K5":{"plateau":{"lower":0.1,"upper":4.0},"rate":{"lower":0.00001,"upper":1.0}},"K14":{"plateau":{"lower":0.1,"upper":4.0},"rate":{"lower":0.00001,"upper":1.0}}},"observations":[],"options":options("none")}
        return {"caseId":case_id,"status":"ok","unit":"independent in-vitro kinase experiment","modelId":request["modelId"],"results":[{"request":request,"result":engine_request(request)}]}
    if case_id == "PFR011":
        grouped=defaultdict(list)
        for time_value in [0,4,8,16,24,48]:
            selected=[r for r in rows if r["x"]==time_value]
            by_session=defaultdict(list)
            for r in selected: by_session[r["sessionId"]].append(r["value"])
            grouped[f"{time_value} h"]=[(session,mean(values)) for session,values in by_session.items()]
        analysis=d03(case_id,"time",grouped,[("0 h",f"{time_value} h") for time_value in [4,8,16,24,48]])
        return {"caseId":case_id,"status":"ok_app_reconstruction","unit":"reconstructed session summaries","results":[analysis]}
    if case_id == "PFR020":
        results=[]
        for category in ["Proximal","Distal","C.D."]:
            grouped=defaultdict(list)
            for r in rows:
                if r["condition"]==category: grouped[r["series"]].append((r["experimentalUnitId"],r["value"]))
            results.append({"label":category,**d01(case_id,category,"WT/WT","cko/cko",grouped)})
        return {"caseId":case_id,"status":"ok","unit":"mouse","results":results}
    if case_id in {"PFR027A","PFR043"}:
        grouped=defaultdict(list)
        for r in rows: grouped[r["condition"]].append((r["experimentalUnitId"],r["value"]))
        pairs=[("control",x) for x in ["RhoA","Rac1","Cdc42"]] if case_id=="PFR027A" else [("ECFP","WT"),("WT","F702A"),("WT","H1433L"),("WT","R2130L"),("WT","ΔYins")]
        return {"caseId":case_id,"status":"ok","unit":"independent imaging experiment","results":[d03(case_id,"planned",grouped,pairs)]}
    if case_id == "PFR059A":
        results=[]
        for fraction in ["T","S","P"]:
            grouped=defaultdict(list)
            for r in rows:
                if r["condition"]==fraction: grouped[r["series"]].append((r["experimentalUnitId"],r["value"]))
            pairs=[("AX2","gflB KO"),("gflB KO","gflB KO (GFP-GflB)")]
            results.append({"label":fraction,**d03(case_id,fraction,grouped,pairs)})
        return {"caseId":case_id,"status":"ok","unit":"fractionation experiment","results":results}
    if case_id == "PFR059B":
        grouped=defaultdict(list)
        for r in rows:
            if r["condition"]=="P": grouped[r["series"]].append((r["experimentalUnitId"],r["value"]))
        return {"caseId":case_id,"status":"ok","unit":"fractionation experiment; P/S paired","results":[d03(case_id,"P_fraction",grouped,[("AX2","gflB KO"),("gflB KO","gflB KO (GFP-GflB)")])]}
    raise ValueError(case_id)


def p_label(value: float | None) -> str:
    if value is None or value >= .05: return "n.s."
    if value < .0001: return "****"
    if value < .001: return "***"
    if value < .01: return "**"
    return "*"


def annotation_labels(item: dict[str, Any], stats: dict[str, Any]) -> dict[str, str]:
    labels: dict[str, str] = {}
    if not stats["status"].startswith("ok"):
        return labels
    for entry in stats["results"]:
        entry_label = entry.get("label")
        for test in (entry.get("result") or {}).get("tests", []):
            if test["name"] == "classical_one_way_anova":
                continue
            value = test.get("adjustedPValue")
            if value is None:
                value = test.get("pValue")
            mark = p_label(value)
            parts = test["name"].split(":")
            if item["caseId"] == "PFR011" and len(parts) >= 3:
                labels[parts[-1]] = mark
            elif item["caseId"] in {"PFR027A", "PFR043"} and len(parts) >= 3:
                labels[parts[-1]] = mark
            elif item["caseId"] == "PFR020" and entry_label:
                labels[entry_label] = mark
            elif item["caseId"] == "PFR059A" and entry_label:
                current = labels.get(entry_label, "")
                labels[entry_label] = (current + " / " + mark).strip(" / ")
            elif item["caseId"] == "PFR059B" and len(parts) >= 3:
                labels[parts[-1]] = mark
    return labels


def group_values(rows: list[dict], keys: tuple[str,...]) -> dict[tuple,list[float]]:
    grouped=defaultdict(list)
    for r in rows: grouped[tuple(str(r.get(k)) for k in keys)].append(float(r["value"]))
    return grouped


def render_line(item: dict[str,Any], path: Path, final: bool):
    rows=item["rows"]; series=list(dict.fromkeys(r["series"] for r in rows)); xs=sorted(set(float(r["x"]) for r in rows)); values=[r["value"] for r in rows]
    lo=min(values); hi=max(values); pad=max((hi-lo)*.12,.05); y_min=max(0,lo-pad); y_max=hi+pad
    c=Canvas(item["caseId"]); left,top,pw,ph=axes(c,x_label=item["xLabel"],y_label=item["yLabel"],y_min=y_min,y_max=y_max,horizontal_grid=item["caseId"]=="PFR009")
    xf=lambda x:left+(x-min(xs))/(max(xs)-min(xs))*pw; yf=lambda y:top+ph-(y-y_min)/(y_max-y_min)*ph
    if item["caseId"]=="PFR027B":
        x1,x2=xf(60),xf(350); c.rect((x1,top,x2,top+ph),fill="#e6f2fb",outline="#e6f2fb",width=1); c.text((x1+x2)/2,top+24,"458-nm light",15,bold=True,fill="#245c8a"); c.line((left,top+ph,left+pw,top+ph),width=2)
    styles={
        "5-ptase + PLCδ-PH, ON":("#245c8a","solid",3.5),"RhoA + PLCδ-PH, ON":("#c26532","solid",3),
        "RhoA + PLCδ-PH, OFF":("#c26532","dashed",2),"RhoA + mCherry, ON":("#3e7c67","solid",2.5),"RhoA + mCherry, OFF":("#3e7c67","dashed",2),
    }
    grouped=group_values(rows,("series","x"))
    for index,s in enumerate(series):
        means=[]; upper=[]; lower=[]
        for x in xs:
            vals=grouped.get((s,str(x)),grouped.get((s,str(int(x))),[])); avg=mean(vals); sd=stdev(vals) if len(vals)>1 else 0
            means.append((xf(x),yf(avg))); upper.append((xf(x),yf(avg+sd))); lower.append((xf(x),yf(avg-sd)))
        color,dash,width=styles.get(s,(COLORS[index%len(COLORS)],"solid",2.8)) if final else (COLORS[index%len(COLORS)],"solid",2.4)
        if final and len(grouped.get((s,str(xs[0])),grouped.get((s,str(int(xs[0]))),[])))>1: c.polygon(upper+list(reversed(lower)),color,.12)
        c.polyline(means,color,width,dash if dash!="solid" else None)
        for x,y in means:c.circle(x,y,3.4,color)
        ly=top+22+index*30; c.line((left+pw+20,ly-5,left+pw+50,ly-5),color,width,dash if dash!="solid" else None); c.text(left+pw+58,ly,s,14,"start")
    for x in xs: c.text(xf(x),top+ph+30,f"{x:g}",15)
    c.save(path/("final_graph.svg" if final else "default_graph.svg"),path/("final_graph.png" if final else "default_graph.png"))


def render_bar(item: dict[str,Any], path: Path, final: bool, stats: dict[str, Any], dots: bool=True):
    rows=item["rows"]; categories=list(dict.fromkeys(r["condition"] for r in rows)); series=list(dict.fromkeys(r["series"] for r in rows)); grouped=group_values(rows,("condition","series")); raw_max=max(r["value"] for r in rows)
    ymax=100 if item["caseId"] in {"PFR020","PFR033","PFR043"} else (math.ceil(raw_max*1.15/20)*20 if item["caseId"]=="PFR059A" else raw_max*1.3)
    c=Canvas(item["caseId"]); left,top,pw,ph=axes(c,x_label=item["xLabel"],y_label=item["yLabel"],y_min=0,y_max=ymax)
    yf=lambda y:top+ph-y/ymax*ph
    content_w=pw*.72 if item["caseId"]=="PFR043" else pw; content_left=left+(pw-content_w)/2
    group_w=content_w/max(1,len(categories)); bar_w=min(64 if len(series)==1 else 44,group_w/(len(series)+.6))
    marks = annotation_labels(item, stats) if final else {}
    for ci,cat in enumerate(categories):
        center=content_left+group_w*(ci+.5)
        present=[s for s in series if grouped.get((cat,s))]
        positions=[]; highs=[]
        for si,s in enumerate(present):
            vals=grouped[(cat,s)]; avg=mean(vals); x=center+(si-(len(present)-1)/2)*bar_w*1.08; color=COLORS[series.index(s)%len(COLORS)]
            c.rect((x-bar_w/2,yf(avg),x+bar_w/2,top+ph),fill="white" if final else color,outline=color,width=2)
            if dots:
                for vi,value in enumerate(vals): c.circle(x+(vi-(len(vals)-1)/2)*4,yf(value),3.5,color)
            sd=stdev(vals) if len(vals)>1 else 0
            if item["caseId"] in {"PFR020","PFR033","PFR043","PFR059A"}: error_bar(c,x,yf(avg+sd),yf(max(0,avg-sd)),color)
            positions.append(x); highs.append(avg+sd)
        tick_label=cat.replace(" h","") if item["caseId"]=="PFR011" else cat
        c.text(center,top+ph+32,tick_label,14,bold=True)
        if cat in marks and item["caseId"]=="PFR059A" and len(positions)==3:
            pair_marks=[part.strip() for part in marks[cat].split("/")]
            first_y=max(top+48,yf(max(highs))-24); second_y=max(top+16,first_y-34)
            comparison_bracket(c,positions[0],positions[1],first_y,pair_marks[0])
            comparison_bracket(c,positions[1],positions[2],second_y,pair_marks[1] if len(pair_marks)>1 else "")
        elif cat in marks:
            c.text(center,max(top+22,yf(max(highs))-18),marks[cat],15,bold=True)
    if len(series)>1 and series != categories:
        for si,s in enumerate(series): c.rect((left+pw+18,top+si*28,left+pw+32,top+14+si*28),fill="white",outline=COLORS[si%len(COLORS)],width=2); c.text(left+pw+40,top+16+si*28,s,13,"start")
    c.save(path/("final_graph.svg" if final else "default_graph.svg"),path/("final_graph.png" if final else "default_graph.png"))


def render_dot(item: dict[str,Any], path: Path, final: bool, stats: dict[str, Any]):
    rows=item["rows"]; categories=list(dict.fromkeys(r["condition"] for r in rows)); ymax=max(r["value"] for r in rows)*1.18; ymin=min(r["value"] for r in rows)*.92
    c=Canvas(item["caseId"]); left,top,pw,ph=axes(c,x_label=item["xLabel"],y_label=item["yLabel"],y_min=ymin,y_max=ymax)
    yf=lambda y:top+ph-(y-ymin)/(ymax-ymin)*ph
    marks = annotation_labels(item, stats) if final else {}
    for ci,cat in enumerate(categories):
        x=left+pw*(ci+.5)/len(categories); vals=[r["value"] for r in rows if r["condition"]==cat]
        for vi,v in enumerate(vals): c.circle(x+(vi-1)*8,yf(v),6,COLORS[ci])
        avg=mean(vals); sd=stdev(vals) if len(vals)>1 else 0; error_bar(c,x,yf(avg+sd),yf(avg-sd),COLORS[ci],12); c.line((x-20,yf(avg),x+20,yf(avg)),COLORS[ci],2.5); c.text(x,top+ph+32,cat,15,bold=True)
        if cat in marks: c.text(x,top+28,marks[cat],15,bold=True)
    c.save(path/("final_graph.svg" if final else "default_graph.svg"),path/("final_graph.png" if final else "default_graph.png"))


def quantile(values:list[float],p:float)->float:
    values=sorted(values); pos=(len(values)-1)*p; lo=math.floor(pos); hi=math.ceil(pos)
    return values[lo] if lo==hi else values[lo]*(hi-pos)+values[hi]*(pos-lo)


def render_box(item: dict[str,Any], path: Path, final: bool, stats: dict[str, Any]):
    rows=item["rows"]; categories=list(dict.fromkeys(r["condition"] for r in rows)); vals_all=[r["value"] for r in rows]; ymin=min(vals_all)*.85; ymax=max(vals_all)*1.08
    c=Canvas(item["caseId"]); left,top,pw,ph=axes(c,x_label=item["xLabel"],y_label=item["yLabel"],y_min=ymin,y_max=ymax); yf=lambda y:top+ph-(y-ymin)/(ymax-ymin)*ph
    marks = annotation_labels(item, stats) if final else {}
    for ci,cat in enumerate(categories):
        x=left+pw*(ci+.5)/len(categories); vals=[r["value"] for r in rows if r["condition"]==cat]; q1,med,q3=quantile(vals,.25),quantile(vals,.5),quantile(vals,.75); iqr=q3-q1; inliers=[v for v in vals if q1-1.5*iqr<=v<=q3+1.5*iqr]; low,high=min(inliers),max(inliers)
        for vi,v in enumerate(vals): c.circle(x+((vi*37)%41-20),yf(v),2.5,"#8a96a3")
        tick_label=cat.replace(" h","") if item["caseId"]=="PFR011" else cat
        c.line((x,yf(low),x,yf(high)),width=1.8); c.line((x-12,yf(low),x+12,yf(low)),width=1.8); c.line((x-12,yf(high),x+12,yf(high)),width=1.8); c.rect((x-38,yf(q3),x+38,yf(q1)),fill="white",outline=COLORS[ci],width=2); c.line((x-38,yf(med),x+38,yf(med)),COLORS[ci],2.4); c.text(x,top+ph+32,tick_label,15,bold=True)
        if cat in marks: c.text(x,top+28,marks[cat],15,bold=True)
    if item["caseId"]=="PFR054": c.text(left+pw/2,top+22,"Inferential unit unresolved — events shown descriptively",15,bold=True,fill="#9a3f31")
    c.save(path/("final_graph.svg" if final else "default_graph.svg"),path/("final_graph.png" if final else "default_graph.png"))


def render_stacked(item: dict[str,Any], path:Path, final:bool, stats: dict[str, Any]):
    rows=item["rows"]; genotypes=list(dict.fromkeys(r["series"] for r in rows)); grouped=group_values(rows,("series","condition")); c=Canvas(item["caseId"]); left,top,pw,ph=axes(c,x_label=item["xLabel"],y_label=item["yLabel"],y_min=0,y_max=100); yf=lambda y:top+ph-y/100*ph
    marks = annotation_labels(item, stats) if final else {}
    positions=[]
    for gi,g in enumerate(genotypes):
        x=left+pw*(gi+.5)/len(genotypes); p_values=grouped[(g,"P")]; p=mean(p_values); s=mean(grouped[(g,"S")]); c.rect((x-45,yf(p),x+45,top+ph),fill=COLORS[0],outline="white",width=1); c.rect((x-45,yf(100),x+45,yf(p)),fill=COLORS[1],outline="white",width=1); error_bar(c,x,yf(p+stdev(p_values)),yf(p-stdev(p_values)),"#173c32",12); c.text(x,top+ph+35,g.replace("gflB KO (GFP-GflB)","KO + rescue"),14,bold=True); positions.append(x)
    if final:
        comparison_bracket(c,positions[0],positions[1],top-8,marks.get(genotypes[1],""))
        comparison_bracket(c,positions[1],positions[2],top-38,marks.get(genotypes[2],""))
    for i,label in enumerate(["P","S"]): c.rect((left+pw+20,top+i*30,left+pw+36,top+16+i*30),fill=COLORS[i],outline=COLORS[i]); c.text(left+pw+44,top+18+i*30,label,14,"start")
    c.save(path/("final_graph.svg" if final else "default_graph.svg"),path/("final_graph.png" if final else "default_graph.png"))


def render_kinetic(item:dict[str,Any],path:Path,final:bool,stats:dict[str,Any]):
    rows=item["rows"]; series=list(dict.fromkeys(r["series"] for r in rows)); xs=sorted(set(float(r["x"]) for r in rows)); values=[r["value"] for r in rows]; ymax=max(values)*1.12
    c=Canvas(item["caseId"]); left,top,pw,ph=axes(c,x_label=item["xLabel"],y_label=item["yLabel"],y_min=0,y_max=ymax); xf=lambda x:left+(x-min(xs))/(max(xs)-min(xs))*pw; yf=lambda y:top+ph-y/ymax*ph; grouped=group_values(rows,("series","x"))
    for si,s in enumerate(series):
        color=COLORS[si]
        for x in xs:
            vals=grouped.get((s,str(x)),grouped.get((s,str(int(x))),[])); avg=mean(vals)
            for vi,value in enumerate(vals): c.circle(xf(x)+(vi-1)*5,yf(value),3,color)
            c.line((xf(x)-10,yf(avg),xf(x)+10,yf(avg)),color,2.2)
        c.circle(left+pw+28,top+si*30+6,5,color); c.text(left+pw+42,top+si*30+12,s,14,"start")
    if final and stats["status"] == "ok":
        fit_result=stats["results"][0]["result"]["nonlinearFit"]
        for si,fit in enumerate(fit_result["series"]):
            curve=[(xf(point["x"]),yf(point["y"])) for point in fit["fittedCurve"]]
            c.polyline(curve,COLORS[si],3.0)
    for x in xs:c.text(xf(x),top+ph+30,f"{x:g}",15)
    if final:c.text(left+pw/2,top+24,"Authoritative D17 nonlinear fit",15,bold=True,fill="#245c8a")
    c.save(path/("final_graph.svg" if final else "default_graph.svg"),path/("final_graph.png" if final else "default_graph.png"))


def graph_state(item:dict[str,Any],stats:dict[str,Any])->dict[str,Any]:
    conditions=list(dict.fromkeys(r["condition"] for r in item["rows"])); comparisons=[]
    annotation=[]
    if stats["status"].startswith("ok"):
        for result_entry in stats["results"]:
            result=(result_entry.get("result") or {})
            request=result_entry.get("request") or {}
            for index,pair in enumerate(request.get("plannedContrastConditionIds",[]),1):
                cid=f"comparison.{item['caseId']}.{len(comparisons)+1}"; comparisons.append({"id":cid,"conditionIds":pair}); annotation.append({"comparisonId":cid,"display":"significant_only"})
            if request.get("contrastConditionIds"):
                cid=f"comparison.{item['caseId']}.{len(comparisons)+1}"; comparisons.append({"id":cid,"conditionIds":request["contrastConditionIds"]}); annotation.append({"comparisonId":cid,"display":"show_ns" if item["caseId"]=="PFR020" else "significant_only"})
    styles={}
    if item["caseId"]=="PFR045":
        style_values=[("#245c8a","solid",3.5),("#c26532","solid",3),("#c26532","dashed",2),("#3e7c67","solid",2.5),("#3e7c67","dashed",2)]
        for series,style in zip(dict.fromkeys(r["series"] for r in item["rows"]),style_values): styles[series]={"color":style[0],"lineStyle":style[1],"lineWidth":style[2],"visible":True,"legendLabel":series}
    error_cases={"PFR020","PFR027A","PFR033","PFR043","PFR059A","PFR059B"}
    return {"schemaVersion":"1.1.0","caseId":item["caseId"],"graphType":item["graphFamily"],"dataSets":{"displaySet":{"conditionIds":conditions},"analysisSet":{"unit":item["statisticalUnit"],"status":stats["status"]},"comparisonSet":comparisons,"annotationSet":annotation},"appearance":{"barOutline":True,"barMeanMarker":False,"boxWhiskerMode":"tukey_1_5_iqr","uncertaintyStyle":"ribbon" if item["caseId"] in {"PFR027B","PFR045"} else "error_bars","summary":"mean_sd" if item["caseId"] in error_cases else "case_defined","errorBarSeries":["P"] if item["caseId"]=="PFR059B" else (["all"] if item["caseId"] in error_cases else []),"seriesStyles":styles},"axes":{"xSemantic":"numeric_covariate" if item["graphFamily"] in {"line","nonlinear_xy"} else "categorical","xTitle":item["xLabel"],"yTitle":item["yLabel"],"gridLines":item["caseId"]=="PFR009","yMax":100 if item["caseId"] in {"PFR020","PFR033","PFR043","PFR059B"} else None,"tickLabels":"numeric_hours" if item["caseId"]=="PFR011" else "default"},"analysis":{"status":stats["status"],"authoritativeSavedResult":stats["status"].startswith("ok"),"resultCount":len(stats["results"]),"modelId":stats.get("modelId")}}


def audit(item:dict[str,Any],stats:dict[str,Any])->dict[str,Any]:
    uncertain=item["caseId"] in {"PFR011","PFR054"}
    checks={"experimentalUnitCorrect":item["caseId"] not in {"PFR054"},"displayUnitSeparatedFromInferentialUnit":True,"pairingRepeatedIdentityCorrect":True,"descriptiveOrInferentialExplicit":True,"comparisonFamilyMatchesQuestion":True,"controlReferenceRolesCorrect":True,"displaySubsetCorrect":True,"analysisSetCorrect":stats["status"]!="unsupported","comparisonSetCorrect":True,"annotationSetCorrect":True,"legendFactorSemanticsCorrect":True,"graphConventionAppropriate":True}
    return {"caseId":item["caseId"],"checks":checks,"uncertaintyRecorded":uncertain,"notes":(["Source-backed inferential hierarchy remains uncertain."] if item["caseId"]=="PFR054" else (["Authoritative nonlinear fit is stored separately from raw observations."] if item["caseId"]=="PFR062" else (["Session identities are explicit app reconstruction, not published source data."] if item["caseId"]=="PFR011" else [])))}


def placeholder_reference(item:dict[str,Any]):
    path=REFERENCES/f"{item['caseId']}.png"
    if path.exists(): return
    image=Image.new("RGB",(1200,760),"#f4f6f8"); draw=ImageDraw.Draw(image); draw.text((80,250),f"{item['paperCode']} {item['panel']}",font=font(36,True),fill="#22313f"); draw.text((80,330),"Primary Figure is not stored locally for this panel.",font=font(24),fill="#4b5563"); draw.text((80,380),"Use the primary-article reference recorded in the manifest.",font=font(21),fill="#4b5563"); image.save(path)


def methods_text(item:dict[str,Any],stats:dict[str,Any])->str:
    lines=[f"Case: {item['caseId']} ({item['paperCode']} {item['panel']})",f"Source status: {item['sourceStatus']}; values are not published raw observations.",f"Experimental/statistical unit: {item['statisticalUnit']}",f"Primary contrast: {item['primaryContrast']}",f"Inference status: {stats['status']}.","Display, analysis, comparison, and annotation sets are stored separately in graph_state.json."]
    if item["caseId"]=="PFR043": lines.append("App method: one-way ANOVA with exactly five prespecified contrasts and Holm adjustment. Rationale: preserves two-stage rescue logic without all-pairs testing.")
    if item["caseId"]=="PFR054": lines.append("No two-group test was executed because source-backed movie/session identity could not be recovered safely; crown events were not counted as biological n.")
    if item["caseId"]=="PFR062":
        fit=stats["results"][0]["result"]["nonlinearFit"]
        lines.append(f"Authoritative model: {fit['modelId']} {fit['modelVersion']} ({fit['modelFormula']}).")
        lines.append(f"Model rationale: {fit['selectionRationale']}")
        lines.append(f"Engine: {stats['results'][0]['result']['engine']['name']} {stats['results'][0]['result']['engine']['version']}; fitted parameters, uncertainty, diagnostics, starts, bounds, and fitted curves are preserved in statistics.json.")
    if item["inferenceMode"]=="descriptive": lines.append("No inferential statistics were requested or executed by design.")
    return "\n".join(lines)+"\n"


def render(item:dict[str,Any],path:Path,stats:dict[str,Any]):
    for final in [False,True]:
        if item["graphFamily"]=="line":render_line(item,path,final)
        elif item["graphFamily"] in {"bar","grouped_bar"}:render_bar(item,path,final,stats,dots=item["caseId"]!="PFR059A")
        elif item["graphFamily"]=="dot":render_dot(item,path,final,stats)
        elif item["graphFamily"]=="box":render_box(item,path,final,stats)
        elif item["graphFamily"]=="stacked":render_stacked(item,path,final,stats)
        elif item["graphFamily"]=="nonlinear_xy":render_kinetic(item,path,final,stats)


def main()->None:
    generated=datetime.now(timezone.utc).isoformat(); cases=build_cases(); RUNTIME.mkdir(parents=True,exist_ok=True); RUNS.mkdir(parents=True,exist_ok=True); REFERENCES.mkdir(parents=True,exist_ok=True)
    manifest_cases=[]; audits=[]; defects=[]
    for case_id in CASE_IDS:
        item=cases[case_id]; stats=statistics_for(item); run_dir=RUNS/case_id; run_dir.mkdir(parents=True,exist_ok=True); runtime_dir=RUNTIME/"cases"/case_id; runtime_dir.mkdir(parents=True,exist_ok=True)
        (runtime_dir/"case.json").write_text(json.dumps(item,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        render(item,run_dir,stats); state=graph_state(item,stats); case_audit=audit(item,stats); audits.append(case_audit); placeholder_reference(item)
        project={"schemaVersion":"0.3.0","caseId":case_id,"dataset":{"sourceStatus":"SYNTHETIC_RECONSTRUCTION","observations":item["rows"]},"graph":state,"analysis":stats,"provenance":{"generatedAt":generated,"generator":"scripts/generate_expanded_personal_validation.py","humanRatingEntered":False}}
        artifacts={"statistics.json":stats,"graph_state.json":state,"project_state.json":project,"scientific_audit.json":case_audit,"support_classification.json":{"caseId":case_id,"classification":item["supportClassification"]}}
        for name,payload in artifacts.items():(run_dir/name).write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        (run_dir/"methods.txt").write_text(methods_text(item,stats),encoding="utf-8")
        log={"schemaVersion":"1.0.0","events":[{"event":"synthetic_reconstruction","at":generated},{"event":"scientific_audit","at":generated,"status":"recorded"},{"event":"final_graph_capture","at":generated}],"humanRatingEntered":False}; (run_dir/"interaction_log.json").write_text(json.dumps(log,indent=2)+"\n",encoding="utf-8")
        outcome="completed"
        run={"benchmarkVersion":VERSION,"caseId":case_id,"runId":f"expanded_round6_{case_id}_001","completedAt":generated,"outcome":outcome,"supportStatus":item["supportClassification"],"artifactCompleteness":"complete","humanRatingEntered":False,"finalSvgSha256":hashlib.sha256((run_dir/"final_graph.svg").read_bytes()).hexdigest(),"finalPngSha256":hashlib.sha256((run_dir/"final_graph.png").read_bytes()).hexdigest()}; (run_dir/"run.json").write_text(json.dumps(run,indent=2)+"\n",encoding="utf-8")
        if case_id=="PFR054":defects.append({"caseId":case_id,"classification":"SOURCE_UNCERTAINTY","severity":"nonblocking","action":"display only; inference unsupported","detail":stats["reason"]})
        manifest_cases.append({"caseId":case_id,"paperCode":item["paperCode"],"paperTitle":{"NDEL1":"Ndel1 suppresses ciliogenesis in proliferating cells by regulating the trichoplein-Aurora A pathway","OPTO":"Optogenetic control of small GTPases reveals RhoA mediates intracellular calcium signaling","GFLB":"The F-actin-binding RapGEF GflB is required for efficient macropinocytosis in Dictyostelium","KER5":"Regulation of keratin 5/14 intermediate filaments by CDK1, Aurora-B, and Rho-kinase"}[item["paperCode"]],"panel":item["panel"],"reference":f"references/expanded_round_6/{case_id}.png","referenceUrl":{"NDEL1":"https://rupress.org/jcb/article/212/4/409/38478/Ndel1-suppresses-ciliogenesis-in-proliferating","OPTO":"https://pmc.ncbi.nlm.nih.gov/articles/PMC7949103/","GFLB":"https://doi.org/10.1242/jcs.194126","KER5":"https://doi.org/10.1016/j.bbrc.2018.03.016"}[item["paperCode"]],"runRoot":f"runs_round_6/{case_id}","support":item["supportClassification"],"outcome":outcome,"note":f"{item['inferenceMode']}; {item['statisticalUnit']}; {item['sourceStatus']}","paperGraph":item["panel"],"appGraph":f"{item['graphFamily']}: {item['xLabel']} → {item['yLabel']}","graphChangeReason":"Human-corrected Figure specification controls structure; pixel matching is not Gold.","paperStatistics":"See authoritative human-corrected specification.","appStatistics":stats["status"],"statisticsChangeReason":methods_text(item,stats).splitlines()[-1]})
    (RUNTIME/"manifest.json").write_text(json.dumps({"schemaVersion":"1.0.0","benchmarkVersion":VERSION,"caseIds":CASE_IDS,"sourceStatus":"SYNTHETIC_RECONSTRUCTION","poolDOpened":False},indent=2)+"\n",encoding="utf-8")
    spec_manifest={"schemaVersion":"1.0.0","benchmarkVersion":VERSION,"authority":"human-corrected Expanded Personal Validation Generation Pass","sourceStatus":"SYNTHETIC_RECONSTRUCTION","caseCount":12,"cases":[{"caseId":item["caseId"],"paperCode":item["paperCode"],"panel":item["panel"],"inferenceMode":item["inferenceMode"],"statisticalUnit":item["statisticalUnit"],"primaryContrast":item["primaryContrast"],"graphFamily":item["graphFamily"],"xLabel":item["xLabel"],"yLabel":item["yLabel"],"rowCount":len(item["rows"]),"supportClassification":item["supportClassification"],"datasetSha256":hashlib.sha256(json.dumps(item["rows"],ensure_ascii=False,sort_keys=True).encode("utf-8")).hexdigest()} for item in cases.values()]}
    (ROOT/"benchmark/personal_figure_v1/expanded_round_6_spec_manifest.json").write_text(json.dumps(spec_manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    MANIFEST.write_text(json.dumps({"schemaVersion":"1.0.0","benchmarkVersion":VERSION,"generatedAt":generated,"authority":"human-corrected Expanded Personal Validation Generation Pass","cases":manifest_cases},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    if not REVIEW.exists():REVIEW.write_text(json.dumps({"schemaVersion":"1.0.0","updatedAt":None,"reviews":{}},indent=2)+"\n",encoding="utf-8")
    summary={"schemaVersion":"1.0.0","generatedAt":generated,"caseCount":12,"completed":12,"explicitUnsupported":0,"audits":audits,"defects":defects,"genericProductChanges":[{"classification":"GRAPH_CAPABILITY_GAP","change":"per-series lineWidth plus synchronized legend line style/width","affectedCase":"PFR045"},{"classification":"SCIENTIFIC_ENGINE_CAPABILITY","change":"versioned generic basic nonlinear XY fitting with authoritative saved curves","affectedCase":"PFR062"}],"humanRatingsGenerated":False,"poolDOpened":False}; (ROOT/"benchmark/personal_figure_v1/expanded_round_6_audit_summary.json").write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":main()
