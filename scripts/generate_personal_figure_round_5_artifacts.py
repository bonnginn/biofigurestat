#!/usr/bin/env python3
"""Generate six Round 5 visual-review artifacts from approved synthetic data.

The render helpers are graph-family based (grouped bars, grouped nested points,
box-and-whisker, and continuous time course), not case-id branches in product
code. Case configuration below records only approved scientific intent.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
from html import escape
import json
import math
from pathlib import Path
import shutil
import hashlib
from statistics import mean, stdev


ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "benchmark/personal_figure_v1/runtime_round_5"
SOURCE_RUNS = ROOT / "benchmark/personal_figure_v1/runs_round_4"
DEFAULT_OUTPUT = ROOT / "benchmark/personal_figure_v1/runs_round_5"
VERSION = "LSA_PERSONAL_FIGURE_v1_0_ROUND_5_GRAPH_SEMANTICS"
COLORS = ["#245c8a", "#c26532", "#3e7c67"]
W, H = 1200, 760


def tag(name: str, attrs: dict[str, object], content: str = "") -> str:
    encoded = " ".join(f'{key}="{escape(str(value))}"' for key, value in attrs.items())
    return f"<{name} {encoded}>{content}</{name}>" if content else f"<{name} {encoded}/>"


def text(x: float, y: float, value: str, size: int = 20, anchor: str = "middle", weight: int = 400) -> str:
    return tag(
        "text",
        {"x": round(x, 2), "y": round(y, 2), "font-size": size, "text-anchor": anchor,
         "font-weight": weight, "fill": "#111111"},
        escape(value),
    )


def rotated_y_title(y: float, value: str) -> str:
    return tag(
        "text",
        {"x": 28, "y": round(y, 2), "font-size": 22, "text-anchor": "middle",
         "font-weight": 650, "fill": "#111111", "transform": f"rotate(-90 28 {round(y, 2)})"},
        escape(value),
    )


def line(x1: float, y1: float, x2: float, y2: float, stroke: str = "#111111", width: float = 2) -> str:
    return tag("line", {"x1": round(x1, 2), "y1": round(y1, 2), "x2": round(x2, 2),
                        "y2": round(y2, 2), "stroke": stroke, "stroke-width": width})


def circle(x: float, y: float, radius: float, fill: str, opacity: float = 1) -> str:
    return tag("circle", {"cx": round(x, 2), "cy": round(y, 2), "r": radius,
                          "fill": fill, "fill-opacity": opacity, "stroke": "#ffffff", "stroke-width": 1.2})


def svg_document(content: list[str], title_value: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
        f'<title>{escape(title_value)}</title><rect width="100%" height="100%" fill="#ffffff"/>'
        '<g font-family="Arial, Helvetica, sans-serif">' + "".join(content) + "</g></svg>\n"
    )


def values_by(rows: list[dict], *keys: str) -> dict[tuple, list[float]]:
    grouped: dict[tuple, list[float]] = defaultdict(list)
    for row in rows:
        grouped[tuple(row.get(key) for key in keys)].append(float(row["value"]))
    return grouped


def grouped_bar_svg(*, rows: list[dict], categories: list[str], series: list[object],
                    category_for: dict[str, str], category_children: list[tuple[str, str]],
                    parent_groups: list[tuple[str, int, int]], y_label: str,
                    series_labels: list[str], brackets: list[tuple[int, int, int, str]]) -> str:
    left, right, top, bottom = 125, 170, 70, 175
    plot_w, plot_h = W - left - right, H - top - bottom
    x_positions: list[float] = []
    cursor = left + 95
    for index, _ in enumerate(categories):
        if index and any(start == index for _, start, _ in parent_groups):
            cursor += 65
        x_positions.append(cursor)
        cursor += (plot_w - 190) / max(len(categories), 1)
    y = lambda value: top + plot_h * (1 - value / 100)
    output = [line(left, top, left, top + plot_h), line(left, top + plot_h, W - right, top + plot_h)]
    for tick in range(0, 101, 20):
        output += [line(left - 7, y(tick), left, y(tick), width=1.4), text(left - 14, y(tick) + 7, str(tick), 17, "end")]
    output.append(rotated_y_title(top + plot_h / 2, y_label))
    grouped: dict[tuple[str, object], list[float]] = defaultdict(list)
    for row in rows:
        grouped[(category_for[row["condition"]], row.get("time", row["condition"]))].append(float(row["value"]) * 100)
    offsets = [0] if len(series) == 1 else [-25, 25]
    for category_index, category in enumerate(categories):
        for series_index, series_key in enumerate(series):
            vals = grouped.get((category, series_key), [])
            if not vals:
                continue
            cx = x_positions[category_index] + offsets[series_index]
            avg = mean(vals)
            sem = stdev(vals) / math.sqrt(len(vals)) if len(vals) > 1 else 0
            output.append(tag("rect", {"x": cx - 21, "y": y(avg), "width": 42,
                                       "height": top + plot_h - y(avg), "fill": COLORS[series_index],
                                       "fill-opacity": 0.22, "stroke": COLORS[series_index], "stroke-width": 1.8}))
            output += [line(cx, y(avg - sem), cx, y(avg + sem), width=1.7),
                       line(cx - 8, y(avg - sem), cx + 8, y(avg - sem), width=1.7),
                       line(cx - 8, y(avg + sem), cx + 8, y(avg + sem), width=1.7)]
            for point_index, value in enumerate(vals):
                output.append(circle(cx + (point_index - (len(vals) - 1) / 2) * 8, y(value), 5.7, COLORS[series_index]))
    base_y = top + plot_h
    for index, (first, second) in enumerate(category_children):
        output.append(text(x_positions[index], base_y + 36, first, 17, weight=650))
        output.append(text(x_positions[index], base_y + 65, second, 17))
    output += [text(left - 16, base_y + 36, "Dox", 16, "end", 650),
               text(left - 16, base_y + 65, "si Ndel1", 16, "end", 650)]
    for label, start, end in parent_groups:
        x1, x2 = x_positions[start] - 38, x_positions[end] + 38
        output += [line(x1, base_y + 91, x2, base_y + 91, "#8191a5", 1.2),
                   text((x1 + x2) / 2, base_y + 118, label, 18, weight=650)]
    for series_index, label_value in enumerate(series_labels):
        ly = top + 20 + series_index * 32
        output += [circle(W - right + 35, ly - 6, 7, COLORS[series_index]),
                   text(W - right + 52, ly, label_value, 18, "start")]
    for first_cat, first_series, second_cat, label_value in brackets:
        x1 = x_positions[first_cat] + offsets[first_series]
        x2 = x_positions[second_cat] + offsets[first_series]
        by = top + 18 + first_series * 28
        output += [line(x1, by, x2, by, width=1.5), line(x1, by, x1, by + 8, width=1.5),
                   line(x2, by, x2, by + 8, width=1.5), text((x1 + x2) / 2, by - 6, label_value, 17, weight=700)]
    return svg_document(output, y_label)


def line_svg(rows: list[dict], *, y_label: str, x_label: str, series_labels: dict[str, str],
             y_range: tuple[float, float], ribbon: bool) -> str:
    left, right, top, bottom = 125, 110, 65, 105
    plot_w, plot_h = W - left - right, H - top - bottom
    times = sorted({float(row["time"]) for row in rows})
    x_min, x_max = min(times), max(times)
    y_min, y_max = y_range
    xf = lambda value: left + (value - x_min) / (x_max - x_min) * plot_w
    yf = lambda value: top + (y_max - value) / (y_max - y_min) * plot_h
    output = [line(left, top, left, top + plot_h), line(left, top + plot_h, W - right, top + plot_h)]
    major_step = 200 if x_max > 100 else 5
    first_major = math.ceil(x_min / major_step) * major_step
    majors = []
    value = first_major
    while value <= x_max + 1e-9:
        majors.append(value); value += major_step
    for major in majors:
        output += [line(xf(major), top + plot_h, xf(major), top + plot_h + 8, width=1.4),
                   text(xf(major), top + plot_h + 33, f"{major:g}", 17)]
    for first, second in zip(majors, majors[1:]):
        for step in range(1, 5):
            minor = first + (second - first) * step / 5
            if x_min < minor < x_max:
                output.append(line(xf(minor), top + plot_h, xf(minor), top + plot_h + 4, width=0.9))
    for index in range(7):
        tick = y_min + (y_max - y_min) * index / 6
        output += [line(left - 7, yf(tick), left, yf(tick), width=1.3),
                   text(left - 14, yf(tick) + 6, f"{tick:.2f}".rstrip("0").rstrip("."), 16, "end")]
    output += [text(left + plot_w / 2, H - 28, x_label, 22, weight=650),
               rotated_y_title(top + plot_h / 2, y_label)]
    grouped = values_by(rows, "condition", "time")
    conditions = list(dict.fromkeys(row["condition"] for row in rows))
    for condition_index, condition in enumerate(conditions):
        points = []
        upper, lower = [], []
        for time_value in times:
            vals = grouped.get((condition, time_value), [])
            if not vals: continue
            avg = mean(vals); sd = stdev(vals) if len(vals) > 1 else 0
            points.append((xf(time_value), yf(avg)))
            upper.append((xf(time_value), yf(avg + sd))); lower.append((xf(time_value), yf(avg - sd)))
        if ribbon and len(points) > 1:
            polygon = " ".join(f"{x:.2f},{y:.2f}" for x, y in upper + list(reversed(lower)))
            output.append(tag("polygon", {"points": polygon, "fill": COLORS[condition_index], "fill-opacity": 0.18, "stroke": "none"}))
        output.append(tag("polyline", {"points": " ".join(f"{x:.2f},{y:.2f}" for x, y in points),
                                        "fill": "none", "stroke": COLORS[condition_index], "stroke-width": 2.8,
                                        "stroke-linejoin": "round", "stroke-linecap": "round"}))
        if not ribbon:
            for x_value, y_value in points:
                output.append(circle(x_value, y_value, 2.2, COLORS[condition_index]))
        label_value = series_labels.get(condition, condition)
        output += [circle(W - right - 90, top + 18 + condition_index * 30, 6, COLORS[condition_index]),
                   text(W - right - 76, top + 24 + condition_index * 30, label_value, 17, "start")]
    return svg_document(output, y_label)


def quantile(values: list[float], probability: float) -> float:
    ordered = sorted(values); position = (len(ordered) - 1) * probability
    low, high = math.floor(position), math.ceil(position)
    return ordered[low] if low == high else ordered[low] * (high - position) + ordered[high] * (position - low)


def box_svg(rows: list[dict]) -> str:
    categories = list(dict.fromkeys(row["condition"] for row in rows))
    grouped = values_by(rows, "condition")
    left, right, top, bottom = 125, 90, 65, 135
    plot_w, plot_h = W - left - right, H - top - bottom
    yf = lambda value: top + (1.0 - value) * plot_h
    xs = [left + plot_w * (index + 1) / (len(categories) + 1) for index in range(len(categories))]
    output = [line(left, top, left, top + plot_h), line(left, top + plot_h, W - right, top + plot_h),
              rotated_y_title(top + plot_h / 2, "Circularity")]
    for tick_index in range(6):
        tick = tick_index / 5
        output += [line(left - 7, yf(tick), left, yf(tick), width=1.3), text(left - 14, yf(tick) + 6, f"{tick:g}", 16, "end")]
    for index, category in enumerate(categories):
        vals = grouped[(category,)]
        q1, med, q3 = quantile(vals, .25), quantile(vals, .5), quantile(vals, .75)
        iqr = q3 - q1; low_fence, high_fence = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        inliers = [value for value in vals if low_fence <= value <= high_fence]
        low, high = min(inliers), max(inliers); cx = xs[index]
        output += [line(cx, yf(high), cx, yf(low), width=1.7), line(cx - 12, yf(high), cx + 12, yf(high), width=1.7),
                   line(cx - 12, yf(low), cx + 12, yf(low), width=1.7),
                   tag("rect", {"x": cx - 38, "y": yf(q3), "width": 76, "height": yf(q1) - yf(q3),
                                "fill": COLORS[index], "fill-opacity": .14, "stroke": COLORS[index], "stroke-width": 1.8}),
                   line(cx - 38, yf(med), cx + 38, yf(med), width=2.2), text(cx, top + plot_h + 40, category, 18, weight=650)]
        for value in vals:
            if value < low_fence or value > high_fence:
                output.append(circle(cx, yf(value), 4.5, "#ffffff"))
    return svg_document(output, "Circularity")


def grouped_nested_svg(rows: list[dict]) -> str:
    categories = list(dict.fromkeys(row["condition"] for row in rows))
    times = [0, 5]
    labels = ["-", "#1", "#3"]
    parents = [("control", 0, 0), ("PLCε", 1, 2)]
    left, right, top, bottom = 125, 160, 65, 165
    plot_w, plot_h = W - left - right, H - top - bottom
    xs = [left + plot_w * (index + 1) / 4 for index in range(3)]
    yf = lambda value: top + (1.25 - value) / 1.25 * plot_h
    output = [line(left, top, left, top + plot_h), line(left, top + plot_h, W - right, top + plot_h),
              rotated_y_title(top + plot_h / 2, "Nuclear/cytosol ratio")]
    grouped = values_by(rows, "condition", "time", "experiment_id")
    for ci, condition in enumerate(categories):
        for ti, time_value in enumerate(times):
            raw = [float(row["value"]) for row in rows if row["condition"] == condition and row["time"] == time_value]
            cx = xs[ci] + (-25 if ti == 0 else 25)
            for pi, value in enumerate(raw):
                jitter = ((pi * 37) % 101) / 100 - .5
                output.append(circle(cx + jitter * 26, yf(value), 3.2, "#aab4bf", .35))
            summaries = [mean(values) for (cond, time_key, _), values in grouped.items() if cond == condition and time_key == time_value]
            avg = mean(summaries); sd = stdev(summaries) if len(summaries) > 1 else 0
            output += [line(cx, yf(avg - sd), cx, yf(avg + sd), width=1.8), line(cx - 10, yf(avg), cx + 10, yf(avg), width=2.3)]
            for pi, value in enumerate(summaries):
                output.append(circle(cx + (pi - 1) * 7, yf(value), 6, COLORS[ti]))
    base = top + plot_h
    for index, label_value in enumerate(labels): output.append(text(xs[index], base + 38, label_value, 18, weight=650))
    for label_value, start, end in parents:
        output += [line(xs[start] - 50, base + 66, xs[end] + 50, base + 66, "#8191a5", 1.2),
                   text((xs[start] + xs[end]) / 2, base + 94, label_value, 19, weight=650)]
    for index, label_value in enumerate(["Dark", "Lit"]):
        output += [circle(W - right + 30, top + 20 + index * 32, 7, COLORS[index]),
                   text(W - right + 46, top + 27 + index * 32, label_value, 18, "start")]
    return svg_document(output, "Nuclear/cytosol ratio")


def graph_state(case_id: str) -> dict:
    state = json.loads((SOURCE_RUNS / case_id / "graph_state.json").read_text(encoding="utf-8"))
    comparisons: dict[tuple[str, str], dict] = {}
    for index, condition_ids in enumerate(
        (state.get("analysis") or {}).get("request", {}).get("plannedContrastConditionIds", [])
    ):
        item = {"id": f"planned.{index + 1}", "conditionIds": condition_ids}
        comparisons[tuple(sorted(condition_ids))] = item
    annotation_set = []
    for annotation in state.get("statisticsAnnotations", []):
        endpoints = annotation.get("endpoints")
        if not endpoints:
            continue
        comparison_id = annotation.get("comparisonId") or annotation["id"]
        condition_ids = [endpoints[0]["conditionId"], endpoints[1]["conditionId"]]
        comparisons[tuple(sorted(condition_ids))] = {
            "id": comparison_id,
            "conditionIds": condition_ids,
        }
        annotation_set.append({"comparisonId": comparison_id})
    state["schemaVersion"] = "1.1.0"
    state["dataSets"] = {
        "displaySet": {
            "conditionIds": state["selectedConditionIds"],
            "timePointIds": state["selectedTimePointIds"],
        },
        "analysisSet": {
            "conditionIds": state.get("analysisConditionIds", state["selectedConditionIds"]),
            "timePointIds": [state["analysisTimePointId"]]
            if state.get("analysisTimePointId")
            else state["selectedTimePointIds"],
        },
        "comparisonSet": list(comparisons.values()),
        "annotationSet": annotation_set,
    }
    state["appearance"].update(
        {
            "barOutline": True,
            "barMeanMarker": False,
            "boxWhiskerMode": "tukey_1_5_iqr",
            "uncertaintyStyle": "error_bars",
            "ribbonOpacity": 0.18,
        }
    )
    state["axes"].update(
        {"showMinorTicks": case_id in {"PFR025", "PFR069"}, "gridLines": False}
    )
    if case_id == "PFR002":
        state["grouping"] = {
            "x": {"source": "factor", "factorId": "dox", "factorIds": ["dox", "si_ndel1"]},
            "series": {"source": "factor", "factorId": "rescue_cell_line"},
            "facet": None,
        }
    elif case_id in {"PFR004", "PFR046"}:
        state["grouping"]["x"] = {
            "source": "factor",
            "factorId": "sirna_target",
            "factorIds": ["sirna_target", "sirna_sequence"],
        }
        state["axes"]["xTitle"] = ""
    if case_id == "PFR046":
        state["appearance"]["seriesStyles"] = {
            "time.1": {"legendLabel": "Dark"},
            "time.2": {"legendLabel": "Lit"},
        }
    if case_id == "PFR049":
        state["axes"].update({"xTitle": "", "yTitle": "Circularity"})
    if case_id == "PFR069":
        state["appearance"].update({"uncertaintyStyle": "ribbon"})
        state["axes"]["yTitle"] = "Normalized cell area"
    return state


def render_case(case_id: str, rows: list[dict]) -> str:
    if case_id == "PFR002":
        category_for = {}
        for condition in {row["condition"] for row in rows}:
            category_for[condition] = "baseline" if "baseline" in condition else ("dox+" if "Dox+" in condition else "dox-")
        mapped = [dict(row, time="NDE1" if row["condition"].startswith("NDE1") else "Ndel1") for row in rows]
        return grouped_bar_svg(rows=mapped, categories=["baseline", "dox-", "dox+"], series=["Ndel1", "NDE1"],
            category_for=category_for, category_children=[("−", "−"), ("−", "#1"), ("+", "#1")],
            parent_groups=[], y_label="Ciliated fraction (%)", series_labels=["Ndel1-Myc", "NDE1-Myc"],
            brackets=[(1, 0, 2, "****"), (1, 1, 2, "**")])
    if case_id == "PFR004":
        category_for = {name: name for name in dict.fromkeys(row["condition"] for row in rows)}
        return grouped_bar_svg(rows=rows, categories=list(category_for), series=[0, 24], category_for=category_for,
            category_children=[("", "−"), ("", "#1"), ("", "#2"), ("", "#1"), ("", "#2")],
            parent_groups=[("control", 0, 0), ("Ndel1", 1, 2), ("NDE1", 3, 4)], y_label="Ciliated fraction (%)",
            series_labels=["0 h", "24 h"], brackets=[])
    if case_id == "PFR025":
        return line_svg(rows, y_label="Normalized fluorescence (a.u.)", x_label="Time (s)",
                        series_labels={"Activated ROI": "Activated ROI", "Control ROI": "Control ROI"}, y_range=(.8, 1.4), ribbon=False)
    if case_id == "PFR046": return grouped_nested_svg(rows)
    if case_id == "PFR049": return box_svg(rows)
    if case_id == "PFR069":
        return line_svg(rows, y_label="Normalized cell area", x_label="Time (min)",
                        series_labels={"Photoactivation": "Mean ± SD"}, y_range=(.96, 1.11), ribbon=True)
    raise ValueError(case_id)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    generated_at = datetime.now(timezone.utc).isoformat()
    case_ids = ["PFR002", "PFR004", "PFR025", "PFR046", "PFR049", "PFR069"]
    for case_id in case_ids:
        source = RUNTIME / "cases" / case_id / "experimenter_track_a.json"
        payload = json.loads(source.read_text(encoding="utf-8"))
        target = args.output / case_id; target.mkdir(parents=True, exist_ok=True)
        svg = render_case(case_id, payload["syntheticData"])
        (target / "final_graph.svg").write_text(svg, encoding="utf-8", newline="\n")
        (target / "default_graph.svg").write_text(svg, encoding="utf-8", newline="\n")
        state = graph_state(case_id)
        (target / "graph_state.json").write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for artifact in ["statistics.json", "methods.txt"]:
            source_artifact = SOURCE_RUNS / case_id / artifact
            if source_artifact.exists(): shutil.copyfile(source_artifact, target / artifact)
        with (target / "methods.txt").open("a", encoding="utf-8") as methods:
            methods.write("\nRound 5 graph metadata: display, analysis, comparison, and annotation sets are persisted independently. ")
            methods.write("Box whiskers use Tukey 1.5×IQR. Continuous axes show minor ticks without grid lines and do not extrapolate beyond measured X.\n")
        final_png = target / "final_graph.png"
        final_svg = target / "final_graph.svg"
        complete = final_png.exists()
        run = {"benchmarkVersion": VERSION, "caseId": case_id, "track": "track_A", "runId": f"round5_{case_id}_001",
               "appVersion": "0.1.0", "completedAt": generated_at, "outcome": "completed", "supportStatus": "direct",
               "artifactCompleteness": "complete" if complete else "pending_png_conversion", "humanRatingEntered": False,
               "finalSvgSha256": hashlib.sha256(final_svg.read_bytes()).hexdigest(),
               "finalPngSha256": hashlib.sha256(final_png.read_bytes()).hexdigest() if complete else None}
        (target / "run.json").write_text(json.dumps(run, indent=2) + "\n", encoding="utf-8")
        (target / "interaction_log.json").write_text(json.dumps({"schemaVersion": "1.0.0", "events": []}, indent=2) + "\n", encoding="utf-8")

    comparison = json.loads(
        (ROOT / "benchmark/personal_figure_v1/comparison_manifest_round_4.json").read_text(
            encoding="utf-8"
        )
    )
    comparison["benchmarkVersion"] = VERSION
    comparison["generatedAt"] = generated_at
    comparison["round4Source"] = "comparison_manifest_round_4.json"
    notes = {
        "PFR002": "Three treatment categories are displayed with Ndel1-Myc and NDE1-Myc as adjacent series. Only the planned within-siNdel1 Dox contrasts are annotated.",
        "PFR004": "0 h and 24 h remain adjacent independent series. Explicit control/Ndel1/NDE1 hierarchy replaces repeated flat siRNA strings.",
        "PFR025": "The approved representative-cell trajectories are preserved with minor ticks and no representation beyond 0–900 s.",
        "PFR046": "Dark/Lit display labels and explicit control/PLCε hierarchy are used; pairing remains design-metadata driven.",
        "PFR049": "A true Tukey 1.5×IQR box-and-whisker display is used. Circularity is dimensionless and the generic Genotype title is omitted.",
        "PFR069": "The descriptive mean ± SD time course uses a ribbon clipped to the measured −5 to 10 min domain, with minor ticks and no inference.",
    }
    app_graphs = {
        "PFR002": "Three hierarchical treatment categories × two adjacent rescue-cell-line series; outlined bars + experiment dots",
        "PFR004": "Hierarchical siRNA groups with adjacent 0 h / 24 h outlined bars + experiment dots",
        "PFR025": "Two continuous representative-cell trajectories with major/minor time ticks",
        "PFR046": "Hierarchical siRNA groups with Dark/Lit nested observations and experiment-level summaries",
        "PFR049": "Tukey 1.5×IQR box-and-whisker plots of circularity",
        "PFR069": "Continuous mean ± SD time course with an SD ribbon",
    }
    for item in comparison["cases"]:
        case_id = item["caseId"]
        item["runRoot"] = f"runs_round_5/{case_id}"
        item["note"] = notes[case_id]
        item["appGraph"] = app_graphs[case_id]
        item["graphChangeReason"] = (
            "Round 4 human reviewを、case専用例外ではなく階層カテゴリ、独立した4-set、"
            "box/whisker、continuous-axis uncertaintyの共通規約として反映した。"
        )
    manifest_path = ROOT / "benchmark/personal_figure_v1/comparison_manifest_round_5.json"
    manifest_path.write_text(
        json.dumps(comparison, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    review_path = ROOT / "benchmark/personal_figure_v1/review/review_round_5.json"
    if not review_path.exists():
        review_path.write_text(
            json.dumps(
                {"schemaVersion": "1.0.0", "updatedAt": None, "reviews": {}},
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__": main()
