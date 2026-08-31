import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_WINDOWS_EXECUTABLE = join(
  ROOT,
  "apps",
  "desktop",
  "src-tauri",
  "target",
  "release",
  "lifescience-analysis-app.exe",
);
const JAPANESE_PATTERN_SOURCE = "[ぁ-んァ-ヶ一-龯]";

export function parseNativeRegressionArguments(argv) {
  const parsed = {
    platform: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "unsupported",
    executable: undefined,
    output: undefined,
    timeoutMs: 20_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--platform" && value) {
      parsed.platform = value;
      index += 1;
    } else if (argument === "--executable" && value) {
      parsed.executable = value;
      index += 1;
    } else if (argument === "--output" && value) {
      parsed.output = value;
      index += 1;
    } else if (argument === "--timeout-ms" && value) {
      parsed.timeoutMs = Number(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs < 1_000 || parsed.timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be between 1000 and 120000");
  }
  if (!new Set(["windows", "macos"]).has(parsed.platform)) {
    throw new Error(`Unsupported native regression platform: ${parsed.platform}`);
  }
  return parsed;
}

export function defaultNativeExecutable(platform) {
  if (platform === "windows") return DEFAULT_WINDOWS_EXECUTABLE;
  return join(
    ROOT,
    "apps",
    "desktop",
    "src-tauri",
    "target",
    "release",
    "bundle",
    "macos",
    "BioFigureStat.app",
    "Contents",
    "MacOS",
    "BioFigureStat",
  );
}

export function japaneseUiAuditExpression() {
  return `(() => {
    const pattern = new RegExp(${JSON.stringify(JAPANESE_PATTERN_SOURCE)}, "u");
    const allowedLanguageControl = (element) =>
      element instanceof HTMLElement &&
      element.tagName === "BUTTON" &&
      element.textContent?.trim() === "日本語";
    const findings = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      const text = node.textContent?.trim() ?? "";
      if (!text || !pattern.test(text) || (parent && allowedLanguageControl(parent))) continue;
      if (parent && getComputedStyle(parent).display === "none") continue;
      findings.push({ kind: "text", value: text.slice(0, 160), tag: parent?.tagName ?? "" });
    }
    for (const element of document.querySelectorAll("[aria-label], [title], [placeholder], [alt]")) {
      for (const attribute of ["aria-label", "title", "placeholder", "alt"]) {
        const value = element.getAttribute(attribute)?.trim() ?? "";
        if (!value || !pattern.test(value)) continue;
        findings.push({ kind: attribute, value: value.slice(0, 160), tag: element.tagName });
      }
    }
    return findings;
  })()`;
}

export function classifyNativeRegressionFailure(error, steps) {
  const failedStep = steps.find((step) => step.status === "fail")?.name;
  const message = String(error);
  if (
    (failedStep === "native_webview_launch" || failedStep === "native_webview_cdp_connect") &&
    (message.includes("CDP") ||
      message.includes("inspection") ||
      message.includes("exited before WebView"))
  ) {
    return "HARNESS_INFRASTRUCTURE_BLOCKED";
  }
  return "PRODUCT_REGRESSION";
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = null;
  }

  async connect() {
    await new Promise((resolvePromise, rejectPromise) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.addEventListener("open", () => resolvePromise());
      socket.addEventListener("error", () => rejectPromise(new Error("Could not connect to WebView2 CDP")));
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (!message.id) return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      });
      socket.addEventListener("close", () => {
        for (const pending of this.pending.values()) {
          pending.reject(new Error("WebView2 CDP connection closed"));
        }
        this.pending.clear();
      });
    });
    await this.call("Runtime.enable");
    await this.call("Page.enable");
  }

  call(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebView2 CDP connection is not open");
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description ?? response.exceptionDetails.text;
      throw new Error(`WebView evaluation failed: ${detail}`);
    }
    return response.result?.value;
  }

  close() {
    this.socket?.close();
  }
}

async function reservePort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPromise(new Error("Could not reserve a local inspection port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? rejectPromise(error) : resolvePromise(port)));
    });
  });
}

async function waitForTarget(port, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Native application exited before WebView inspection (code ${child.exitCode})`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page" && target.url.startsWith("http://tauri.localhost"));
        if (page?.webSocketDebuggerUrl) return page;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }
  throw new Error(
    `Native WebView did not expose a CDP target on 127.0.0.1:${port}${lastError ? `: ${lastError}` : ""}`,
  );
}

async function waitFor(client, expression, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await client.evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function captureScreenshot(client, target) {
  const response = await client.call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(target, Buffer.from(response.data, "base64"));
}

function pageAction(source, argument) {
  return `(${source})(${JSON.stringify(argument)})`;
}

const clickByText = (text) => {
  const normalize = (value) => value.replace(/\s+/g, " ").trim();
  const target = [...document.querySelectorAll("button, a")]
    .filter((element) => !element.disabled)
    .sort(
      (left, right) =>
        normalize(left.textContent ?? "").length - normalize(right.textContent ?? "").length,
    )
    .find((element) => {
      const candidate = normalize(element.textContent ?? "");
      return candidate === text || candidate.endsWith(text);
    });
  if (!target) throw new Error(`Could not find enabled control: ${text}`);
  target.click();
  return true;
};

const setInputByLabel = ({ labelText, value }) => {
  const normalize = (candidate) => candidate.replace(/\s+/g, " ").trim();
  const label = [...document.querySelectorAll("label")].find((candidate) =>
    normalize(candidate.textContent ?? "").startsWith(labelText),
  );
  const input = label?.querySelector("input, textarea, select");
  if (!input) throw new Error(`Could not find input for label: ${labelText}`);
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : input instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error(`Input value setter is unavailable: ${labelText}`);
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return input.value;
};

async function runWindowsScenario({ executable, outputDirectory, timeoutMs }) {
  const port = await reservePort();
  const profileDirectory = await mkdtemp(join(tmpdir(), "biofigurestat-native-regression-profile-"));
  const exportTarget = join(outputDirectory, "native-command-export.svg");
  const nativeOutput = [];
  const child = spawn(executable, [], {
    cwd: ROOT,
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-allow-origins=*`,
      WEBVIEW2_USER_DATA_FOLDER: profileDirectory,
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const collectNativeOutput = (chunk) => {
    nativeOutput.push(String(chunk));
    if (nativeOutput.join("").length > 65_536) nativeOutput.shift();
  };
  child.stdout?.on("data", collectNativeOutput);
  child.stderr?.on("data", collectNativeOutput);
  const steps = [];
  let client;
  const runStep = async (name, action) => {
    const startedAt = Date.now();
    try {
      const detail = await action();
      steps.push({ name, status: "pass", durationMs: Date.now() - startedAt, detail });
      return detail;
    } catch (error) {
      steps.push({ name, status: "fail", durationMs: Date.now() - startedAt, detail: String(error) });
      throw error;
    }
  };

  try {
    const target = await runStep("native_webview_launch", () => waitForTarget(port, timeoutMs, child));
    client = new CdpClient(target.webSocketDebuggerUrl);
    await runStep("native_webview_cdp_connect", () => client.connect());
    await runStep("isolated_english_session", async () => {
      await client.evaluate(`(() => {
        localStorage.setItem("biofigurestat.app-locale.v1", "en");
        localStorage.setItem("lsaa.usage-telemetry.consent.v1", "opted_out");
        localStorage.setItem("lsaa.usage-telemetry.consent-notice.v1", "remote-alpha-2026-08-30");
        location.reload();
      })()`);
      await waitFor(
        client,
        `document.documentElement.lang === "en" && document.body.innerText.includes("Which experiment are you working on?")`,
        "English Home",
        timeoutMs,
      );
    });
    await runStep("native_architecture_ipc", async () => {
      const architecture = await client.evaluate(
        `window.__TAURI_INTERNALS__.invoke("native_architecture")`,
      );
      if (!architecture || typeof architecture !== "string") throw new Error("Architecture IPC returned no value");
      return { architecture };
    });
    await runStep("home_has_no_japanese_application_copy", async () => {
      const findings = await client.evaluate(japaneseUiAuditExpression());
      if (findings.length) throw new Error(`Japanese application copy found: ${JSON.stringify(findings)}`);
      return { findings: 0 };
    });
    await runStep("native_export_ipc", async () => {
      const payload = Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"><title>native regression</title></svg>");
      await client.evaluate(
        `window.__TAURI_INTERNALS__.invoke("write_export_file", ${JSON.stringify({
          target: exportTarget,
          bytes: [...payload],
        })})`,
      );
      const written = await readFile(exportTarget, "utf8");
      if (written !== payload.toString("utf8")) throw new Error("Native export bytes changed");
      return { target: exportTarget, bytes: payload.length };
    });
    await runStep("open_simple_experiment_entry", async () => {
      await client.evaluate(pageAction(clickByText, "New experiment"));
      await waitFor(
        client,
        `document.body.innerText.includes("Where would you like to start?")`,
        "New Experiment hub",
        timeoutMs,
      );
      await client.evaluate(`document.querySelector('[data-entry-id="simple"] button').click()`);
      await waitFor(
        client,
        `document.body.innerText.includes("Simple independent-group comparison")`,
        "simple independent-group entry",
        timeoutMs,
      );
      const findings = await client.evaluate(japaneseUiAuditExpression());
      if (findings.length) throw new Error(`Japanese application copy found: ${JSON.stringify(findings)}`);
      await captureScreenshot(client, join(outputDirectory, "simple-independent-entry.png"));
      return { findings: 0 };
    });
    await runStep("dirty_entry_retains_values", async () => {
      await client.evaluate(pageAction(setInputByLabel, { labelText: "Experiment title", value: "Native regression experiment" }));
      await client.evaluate(pageAction(setInputByLabel, { labelText: "Measured readout", value: "Reporter intensity" }));
      await client.evaluate(pageAction(setInputByLabel, { labelText: "Experimental unit assigned", value: "culture dish" }));
      const value = await client.evaluate(`document.querySelector('.simple-group-entry input').value`);
      if (value !== "Native regression experiment") throw new Error("React input did not retain the entered title");
      // Give React's dirty-state effect one turn to publish to the native lifecycle
      // adapter. The input value itself is verified above; it is not rendered in
      // innerText and therefore must not be used as a DOM-text wait condition.
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      return { title: value };
    });
    await runStep("native_close_requires_guard_and_cancel_retains_work", async () => {
      await client.evaluate(
        `window.__TAURI_INTERNALS__.invoke("plugin:window|close", { label: "main" })`,
      );
      await waitFor(
        client,
        `document.querySelector('.unsaved-changes-dialog') !== null`,
        "native close unsaved-work guard",
        timeoutMs,
      );
      const findings = await client.evaluate(japaneseUiAuditExpression());
      if (findings.length) throw new Error(`Japanese copy found in close guard: ${JSON.stringify(findings)}`);
      await client.evaluate(pageAction(clickByText, "Cancel"));
      await waitFor(
        client,
        `document.querySelector('.unsaved-changes-dialog') === null`,
        "close guard cancellation",
        timeoutMs,
      );
      const value = await client.evaluate(`document.querySelector('.simple-group-entry input').value`);
      if (value !== "Native regression experiment") throw new Error("Cancel lost the dirty entry");
      return { retainedTitle: value };
    });
    await runStep("native_close_discard_exits", async () => {
      await client.evaluate(
        `window.__TAURI_INTERNALS__.invoke("plugin:window|close", { label: "main" })`,
      );
      await waitFor(
        client,
        `document.querySelector('.unsaved-changes-dialog') !== null`,
        "second native close guard",
        timeoutMs,
      );
      await captureScreenshot(client, join(outputDirectory, "native-close-guard.png"));
      await client.evaluate(pageAction(clickByText, "Discard changes and continue"));
      await new Promise((resolvePromise, rejectPromise) => {
        const timeout = setTimeout(() => rejectPromise(new Error("Application did not exit after approved discard")), timeoutMs);
        child.once("exit", (code) => {
          clearTimeout(timeout);
          if (code === 0 || code === null) resolvePromise();
          else rejectPromise(new Error(`Application exited with code ${code}`));
        });
      });
      return { exited: true };
    });
  } catch (error) {
    const output = nativeOutput.join("");
    if (output) await writeFile(join(outputDirectory, "native-output.txt"), output, "utf8");
    if (client) {
      try {
        await captureScreenshot(client, join(outputDirectory, "failure.png"));
        const body = await client.evaluate(`document.body?.innerText ?? ""`);
        await writeFile(join(outputDirectory, "failure-body.txt"), `${body}\n`, "utf8");
      } catch {
        // Preserve the original scenario failure even if evidence capture is unavailable.
      }
    }
    if (error && typeof error === "object") error.nativeSteps = steps;
    throw error;
  } finally {
    client?.close();
    if (child.exitCode === null && !child.killed) child.kill();
  }
  return { steps, profileDirectory, exportTarget };
}

export async function runNativeUiRegression(options) {
  const executable = resolve(options.executable ?? defaultNativeExecutable(options.platform));
  if (!isAbsolute(executable)) throw new Error("Native executable path must be absolute");
  if (options.platform === "macos") {
    throw new Error(
      "macOS native UI driving is not implemented yet. Run native:verify:mac and use the bounded manual handoff.",
    );
  }
  const outputDirectory = resolve(
    options.output ?? join(ROOT, ".tmp", "native-ui-regression", new Date().toISOString().replaceAll(":", "-")),
  );
  await mkdir(outputDirectory, { recursive: true });
  const startedAt = new Date().toISOString();
  let result;
  let failure;
  try {
    result = await runWindowsScenario({
      executable,
      outputDirectory,
      timeoutMs: options.timeoutMs,
    });
  } catch (error) {
    failure = error;
  }
  const report = {
    schemaVersion: "1.1.0",
    startedAt,
    completedAt: new Date().toISOString(),
    platform: options.platform,
    executable,
    executableName: basename(executable),
    outputDirectory,
    status: failure
      ? classifyNativeRegressionFailure(failure, failure?.nativeSteps ?? []) ===
        "HARNESS_INFRASTRUCTURE_BLOCKED"
        ? "blocked"
        : "fail"
      : "pass",
    failureClass: failure
      ? classifyNativeRegressionFailure(failure, failure?.nativeSteps ?? [])
      : undefined,
    steps: result?.steps ?? failure?.nativeSteps ?? [],
    error: failure ? String(failure) : undefined,
  };
  await writeFile(join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (failure) throw new Error(`${failure}\nNative regression report: ${join(outputDirectory, "report.json")}`);
  return report;
}

async function main() {
  const options = parseNativeRegressionArguments(process.argv.slice(2));
  const report = await runNativeUiRegression(options);
  console.log(`Native UI regression PASS: ${report.outputDirectory}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
