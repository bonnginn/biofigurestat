const readabilityOptions = ["Good", "OK", "Insufficient"];
const preferenceOptions = ["Like", "Neutral", "Dislike"];
let manifest;
const requestedRound = new URLSearchParams(window.location.search).get("round");
const round = requestedRound === "1" || requestedRound === "3" ? requestedRound : "2";
let reviewData = { schemaVersion: "1.0.0", updatedAt: null, reviews: {} };
let index = 0;

const $ = (id) => document.getElementById(id);
const join = (root, file) => `${root}/${file}`;

function segmented(id, options) {
  const node = $(id);
  node.replaceChildren(
    ...options.map((value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = value;
      button.dataset.value = value.toLowerCase();
      button.onclick = () => {
        [...node.children].forEach((item) => item.classList.remove("selected"));
        button.classList.add("selected");
        dirty();
      };
      return button;
    }),
  );
}

function dirty() {
  $("saveState").textContent = "未保存の変更";
}
function currentReview() {
  return reviewData.reviews[manifest.cases[index].caseId] ?? {};
}
function collect() {
  const selected = (id) => $(id).querySelector(".selected")?.dataset.value ?? null;
  return {
    readability: selected("readability"),
    preference: selected("preference"),
    flags: [...document.querySelectorAll(".flags input:checked")].map((x) => x.value),
    comment: $("comment").value,
    reviewedAt: new Date().toISOString(),
  };
}
function render() {
  const item = manifest.cases[index];
  const review = currentReview();
  $("progressText").textContent =
    `${Object.keys(reviewData.reviews).length} reviewed / ${manifest.cases.length}`;
  $("caseMeta").textContent =
    `Round ${round} · ${item.caseId} · ${item.paperCode} · ${item.panel} · ${item.support}`;
  $("caseTitle").textContent = item.paperTitle;
  $("caseNote").textContent = item.note;
  $("referenceImage").src = `../${item.reference}`;
  $("defaultImage").src = join(`../${item.runRoot}`, "default_graph.png");
  const finalAvailable = item.outcome === "completed";
  $("finalImage").src = join(
    `../${item.runRoot}`,
    finalAvailable ? "final_graph.png" : "default_graph.png",
  );
  $("finalFallback").textContent = finalAvailable
    ? ""
    : "Finalなし：明示的unsupportedのためDefaultを再掲";
  $("paperGraph").textContent = item.paperGraph;
  $("appGraph").textContent = item.appGraph;
  $("graphChangeReason").textContent = `理由：${item.graphChangeReason}`;
  $("paperStatistics").textContent = item.paperStatistics;
  $("appStatistics").textContent = item.appStatistics;
  $("statisticsChangeReason").textContent = `理由：${item.statisticsChangeReason}`;
  $("methodsLink").href = finalAvailable
    ? join(`../${item.runRoot}`, "methods.txt")
    : join(`../${item.runRoot}`, "run.json");
  $("statisticsLink").href = finalAvailable
    ? join(`../${item.runRoot}`, "statistics.json")
    : join(`../${item.runRoot}`, "run.json");
  for (const id of ["readability", "preference"])
    [...$(id).children].forEach((b) =>
      b.classList.toggle("selected", b.dataset.value === review[id]),
    );
  document.querySelectorAll(".flags input").forEach((x) => {
    x.checked = (review.flags ?? []).includes(x.value);
  });
  $("comment").value = review.comment ?? "";
  [...$("caseList").children].forEach((b, i) => b.classList.toggle("active", i === index));
  $("prev").disabled = index === 0;
  $("next").disabled = index === manifest.cases.length - 1;
  $("saveState").textContent = "保存済み";
}
async function save() {
  reviewData.reviews[manifest.cases[index].caseId] = collect();
  reviewData.updatedAt = new Date().toISOString();
  const response = await fetch(`/api/personal-review?round=${round}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reviewData),
  });
  if (!response.ok) throw new Error("save failed");
  $("saveState").textContent = "保存済み";
  render();
}
function exportJson() {
  const blob = new Blob([JSON.stringify(reviewData, null, 2) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `personal_figure_reviews_round_${round}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function init() {
  const manifestPath =
    round === "1" ? "../comparison_manifest.json" : `../comparison_manifest_round_${round}.json`;
  manifest = await fetch(manifestPath).then((r) => r.json());
  try {
    reviewData = await fetch(`/api/personal-review?round=${round}`).then((r) => r.json());
  } catch {}
  segmented("readability", readabilityOptions);
  segmented("preference", preferenceOptions);
  const nav = $("caseList");
  manifest.cases.forEach((item, i) => {
    const b = document.createElement("button");
    b.className = "case-button";
    b.innerHTML = `<strong>${item.caseId} · ${item.panel}</strong><small>${item.paperCode} · ${item.support}</small>`;
    b.onclick = () => {
      index = i;
      render();
    };
    nav.append(b);
  });
  $("prev").onclick = () => {
    index--;
    render();
  };
  $("next").onclick = () => {
    index++;
    render();
  };
  $("comment").oninput = dirty;
  document.querySelectorAll(".flags input").forEach((x) => (x.onchange = dirty));
  $("save").onclick = () =>
    save().catch(() => {
      $("saveState").textContent = "保存失敗";
    });
  $("export").onclick = exportJson;
  render();
}
init();
