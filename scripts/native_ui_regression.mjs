import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

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
const DEFAULT_MAC_APP = join(
  ROOT,
  "apps",
  "desktop",
  "src-tauri",
  "target",
  "release",
  "bundle",
  "macos",
  "BioFigureStat.app",
);
const JAPANESE_PATTERN_SOURCE = "[ぁ-んァ-ヶ一-龯]";
const execFileAsync = promisify(execFile);

export function parseNativeRegressionArguments(argv) {
  const parsed = {
    platform:
      process.platform === "win32"
        ? "windows"
        : process.platform === "darwin"
          ? "macos"
          : "unsupported",
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
  if (
    !Number.isFinite(parsed.timeoutMs) ||
    parsed.timeoutMs < 1_000 ||
    parsed.timeoutMs > 120_000
  ) {
    throw new Error("--timeout-ms must be between 1000 and 120000");
  }
  if (!new Set(["windows", "macos"]).has(parsed.platform)) {
    throw new Error(`Unsupported native regression platform: ${parsed.platform}`);
  }
  return parsed;
}

export function defaultNativeExecutable(platform) {
  if (platform === "windows") return DEFAULT_WINDOWS_EXECUTABLE;
  return DEFAULT_MAC_APP;
}

export function macBundleExecutableFromPlist(plist) {
  const match = plist.match(
    /<key>\s*CFBundleExecutable\s*<\/key>\s*<string>\s*([^<]+?)\s*<\/string>/u,
  );
  if (!match) {
    throw new Error("HARNESS_EXECUTABLE_RESOLUTION: CFBundleExecutable is missing from Info.plist");
  }
  return match[1]
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

export async function resolveNativeExecutable(platform, requestedTarget) {
  const target = resolve(requestedTarget ?? defaultNativeExecutable(platform));
  if (platform !== "macos" || !target.toLowerCase().endsWith(".app")) return target;
  const plistPath = join(target, "Contents", "Info.plist");
  try {
    const plist = await readFile(plistPath, "utf8");
    return join(target, "Contents", "MacOS", macBundleExecutableFromPlist(plist));
  } catch (error) {
    if (String(error).includes("HARNESS_EXECUTABLE_RESOLUTION")) throw error;
    throw new Error(`HARNESS_EXECUTABLE_RESOLUTION: cannot read ${plistPath}: ${String(error)}`);
  }
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

export function selectWebviewTarget(targets) {
  const pages = targets.filter(
    (target) => target.type === "page" && typeof target.webSocketDebuggerUrl === "string",
  );
  return (
    pages.find((target) => /^(?:https?|tauri):\/\/tauri\.localhost/.test(target.url ?? "")) ??
    pages.find((target) => (target.url ?? "") === "") ??
    pages[0]
  );
}

export function classifyNativeRegressionFailure(error, steps) {
  const failedStep = steps.find((step) => step.status === "fail")?.name;
  const message = String(error);
  if (/HARNESS_EXECUTABLE_RESOLUTION/i.test(message)) {
    return "HARNESS_INFRASTRUCTURE_BLOCKED";
  }
  if (/HARNESS_FILE_DIALOG_AUTOMATION/i.test(message)) {
    return "HARNESS_INFRASTRUCTURE_BLOCKED";
  }
  if (failedStep === "macos_accessibility_attach" && /code -2|ENOENT|spawn/i.test(message)) {
    return "HARNESS_INFRASTRUCTURE_BLOCKED";
  }
  if (
    failedStep === "macos_dirty_entry" &&
    /Accessibility element not found|not exposed through macOS Accessibility/i.test(message)
  ) {
    return "HARNESS_INFRASTRUCTURE_BLOCKED";
  }
  if (
    failedStep === "macos_accessibility_attach" &&
    /Accessibility|osascript|not allowed/i.test(message)
  ) {
    return "HARNESS_INFRASTRUCTURE_BLOCKED";
  }
  if (
    (failedStep === "native_webview_launch" || failedStep === "native_webview_cdp_connect") &&
    (message.includes("CDP") ||
      message.includes("inspection") ||
      message.includes("exited before WebView"))
  ) {
    return "HARNESS_INFRASTRUCTURE_BLOCKED";
  }
  if (
    failedStep === "windows_lsa_command_line_open" &&
    /CDP|inspection|exited before WebView/i.test(message)
  ) {
    return "HARNESS_INFRASTRUCTURE_BLOCKED";
  }
  if (
    failedStep === "isolated_english_session" &&
    /localStorage.*Access is denied|about:blank|opaque origin/i.test(message)
  ) {
    return "HARNESS_INFRASTRUCTURE_BLOCKED";
  }
  return "PRODUCT_REGRESSION";
}

export function windowsCloseCommand(processId) {
  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new Error("Windows native-close process ID must be a positive integer");
  }
  return [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `if (-not (Get-Process -Id ${processId} -ErrorAction Stop).CloseMainWindow()) { throw 'Native window did not accept WM_CLOSE' }`,
  ];
}

export function windowsFileDialogCommand(processId, action, target = "") {
  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new Error("Windows file-dialog process ID must be a positive integer");
  }
  if (!new Set(["cancel", "save"]).has(action)) {
    throw new Error(`Unsupported Windows file-dialog action: ${action}`);
  }
  if (action === "save" && !isAbsolute(target)) {
    throw new Error("Windows file-dialog save target must be absolute");
  }
  const encodedTarget = Buffer.from(target, "utf16le").toString("base64");
  const script = String.raw`
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
} catch {
  throw 'HARNESS_FILE_DIALOG_AUTOMATION: Windows UI Automation is unavailable: ' + $_.Exception.Message
}
$processId = ${processId}
$action = '${action}'
$target = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedTarget}'))
$desktop = [Windows.Automation.AutomationElement]::RootElement
$processCondition = [Windows.Automation.PropertyCondition]::new(
  [Windows.Automation.AutomationElement]::ProcessIdProperty,
  $processId
)
$windowTypeCondition = [Windows.Automation.PropertyCondition]::new(
  [Windows.Automation.AutomationElement]::ControlTypeProperty,
  [Windows.Automation.ControlType]::Window
)
$windowCondition = [Windows.Automation.AndCondition]::new(
  [Windows.Automation.Condition[]]@($processCondition, $windowTypeCondition)
)
$deadline = [DateTime]::UtcNow.AddSeconds(20)
$dialog = $null
while ([DateTime]::UtcNow -lt $deadline -and $null -eq $dialog) {
  $windows = $desktop.FindAll([Windows.Automation.TreeScope]::Children, $windowCondition)
  foreach ($window in $windows) {
    if ($window.Current.ClassName -eq '#32770' -or $window.Current.Name -match 'Save|保存') {
      $dialog = $window
      break
    }
  }
  if ($null -eq $dialog) { Start-Sleep -Milliseconds 100 }
}
if ($null -eq $dialog) { throw 'FILE_DIALOG_NOT_FOUND: native Save dialog did not appear' }
if ($action -eq 'cancel') {
  $cancelId = [Windows.Automation.PropertyCondition]::new(
    [Windows.Automation.AutomationElement]::AutomationIdProperty,
    '2'
  )
  $cancel = $dialog.FindFirst(
    [Windows.Automation.TreeScope]::Descendants,
    $cancelId
  )
  if ($null -eq $cancel) {
    $cancelNames = [Windows.Automation.OrCondition]::new(
      [Windows.Automation.Condition[]]@(
        [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, 'Cancel'),
        [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, 'キャンセル')
      )
    )
    $cancel = $dialog.FindFirst([Windows.Automation.TreeScope]::Descendants, $cancelNames)
  }
  if ($null -eq $cancel) { throw 'FILE_DIALOG_CONTROL_NOT_FOUND: Cancel button' }
  $cancel.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
} else {
  $fileNameId = [Windows.Automation.PropertyCondition]::new(
    [Windows.Automation.AutomationElement]::AutomationIdProperty,
    '1001'
  )
  $edit = $dialog.FindFirst(
    [Windows.Automation.TreeScope]::Descendants,
    $fileNameId
  )
  if ($null -eq $edit) {
    $editType = [Windows.Automation.PropertyCondition]::new(
      [Windows.Automation.AutomationElement]::ControlTypeProperty,
      [Windows.Automation.ControlType]::Edit
    )
    $edit = $dialog.FindFirst([Windows.Automation.TreeScope]::Descendants, $editType)
  }
  if ($null -eq $edit) { throw 'FILE_DIALOG_CONTROL_NOT_FOUND: file name input' }
  $edit.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern).SetValue($target)
  $saveId = [Windows.Automation.PropertyCondition]::new(
    [Windows.Automation.AutomationElement]::AutomationIdProperty,
    '1'
  )
  $save = $dialog.FindFirst(
    [Windows.Automation.TreeScope]::Descendants,
    $saveId
  )
  if ($null -eq $save) {
    $saveNames = [Windows.Automation.OrCondition]::new(
      [Windows.Automation.Condition[]]@(
        [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, 'Save'),
        [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, '保存')
      )
    )
    $save = $dialog.FindFirst([Windows.Automation.TreeScope]::Descendants, $saveNames)
  }
  if ($null -eq $save) { throw 'FILE_DIALOG_CONTROL_NOT_FOUND: Save button' }
  $save.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
}
[Console]::Out.Write((ConvertTo-Json @{ ok = $true; action = $action; dialog = $dialog.Current.Name } -Compress))
`;
  return ["-NoProfile", "-NonInteractive", "-Command", script];
}

export function macAccessibilityScript(action, names = [], value = "") {
  return `
const se = Application("System Events");
const process = se.processes.byName("BioFigureStat");
if (!process.exists()) throw new Error("BioFigureStat process is unavailable");
process.frontmost = true;
const wanted = ${JSON.stringify(names)};
const replacement = ${JSON.stringify(value)};
const action = ${JSON.stringify(action)};
const nodes = [];
const queue = [];
try { queue.push(...process.windows()); } catch (_) {}
while (queue.length && nodes.length < 5000) {
  const element = queue.shift();
  let role = "", name = "", currentValue = "", description = "";
  try { role = String(element.role()); } catch (_) {}
  try { name = String(element.name()); } catch (_) {}
  try { currentValue = String(element.value()); } catch (_) {}
  try { description = String(element.description()); } catch (_) {}
  nodes.push({ element, role, name, value: currentValue, description });
  try { queue.push(...element.uiElements()); } catch (_) {}
}
const normalized = (text) => String(text || "").replace(/\\s+/g, " ").trim();
const matches = (node) => wanted.some((candidate) =>
  [node.name, node.value, node.description].some((text) => normalized(text) === candidate)
);
if (action === "snapshot") {
  JSON.stringify({ count: nodes.length, elements: nodes.map(({ role, name, value, description }) => ({ role, name, value, description })) });
} else if (action === "quit") {
  se.keystroke("q", { using: "command down" });
  JSON.stringify({ ok: true });
} else {
  const matchingNodes = nodes.filter(matches);
  const editableRoles = new Set(["AXTextField", "AXTextArea", "AXComboBox", "AXSearchField"]);
  const target = (action === "set" || action === "type")
    ? matchingNodes.find((node) => editableRoles.has(node.role)) || matchingNodes[0]
    : matchingNodes[0];
  if (!target) throw new Error("Accessibility element not found: " + wanted.join(" / "));
  let typingPoint = null;
  if (action === "click") {
    target.element.actions.byName("AXPress").perform();
  } else if (action === "set") {
    target.element.value = replacement;
  } else if (action === "type") {
    try {
      const position = target.element.position();
      const size = target.element.size();
      typingPoint = [
        Math.round(Number(position[0]) + Number(size[0]) / 2),
        Math.round(Number(position[1]) + Number(size[1]) / 2),
      ];
      se.click({ at: typingPoint });
    } catch (_) {
      try { target.element.actions.byName("AXPress").perform(); } catch (_) {}
    }
    try { target.element.focused = true; } catch (_) {}
    se.keystroke("a", { using: "command down" });
    se.keystroke(replacement);
  } else {
    throw new Error("Unsupported accessibility action: " + action);
  }
  JSON.stringify({ ok: true, role: target.role, name: target.name, typingPoint });
}`;
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
      socket.addEventListener("error", () =>
        rejectPromise(new Error("Could not connect to WebView2 CDP")),
      );
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
      const detail =
        response.exceptionDetails.exception?.description ?? response.exceptionDetails.text;
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
      throw new Error(
        `Native application exited before WebView inspection (code ${child.exitCode})`,
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        // A freshly created WebView2 profile exposes its page target before the
        // initial Tauri URL is committed. In that interval `url` is an empty
        // string even though the target is already the exact spawned WebView.
        const page = selectWebviewTarget(targets);
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

async function connectToStableWebview(port, initialTarget, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  const attemptedTargetIds = new Set();
  let target = initialTarget;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Native application exited before WebView inspection (code ${child.exitCode})`,
      );
    }
    if (target && !attemptedTargetIds.has(target.id)) {
      attemptedTargetIds.add(target.id);
      const candidate = new CdpClient(target.webSocketDebuggerUrl);
      try {
        await candidate.connect();
        const navigationDeadline = Math.min(deadline, Date.now() + 5_000);
        let appDocumentReady = false;
        while (Date.now() < navigationDeadline) {
          const documentState = await candidate.evaluate(`(() => {
            let storageAccessible = false;
            try {
              localStorage.getItem("biofigurestat.native-regression.probe");
              storageAccessible = true;
            } catch (_) {}
            return { href: location.href, readyState: document.readyState, storageAccessible };
          })()`);
          if (
            /^(?:https?|tauri):\/\/tauri\.localhost/.test(documentState?.href ?? "") &&
            documentState?.readyState !== "loading" &&
            documentState?.storageAccessible
          ) {
            appDocumentReady = true;
            break;
          }
          await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
        }
        if (!appDocumentReady) {
          throw new Error("WebView target remained at an opaque or blank document");
        }
        return { client: candidate, target };
      } catch (error) {
        lastError = error;
        candidate.close();
      }
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        target = selectWebviewTarget(
          targets.filter((candidate) => !attemptedTargetIds.has(candidate.id)),
        );
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }
  throw new Error(`WebView2 CDP target never became stable: ${String(lastError)}`);
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
  const explicitlyNamed = [...document.querySelectorAll("input, textarea, select")].find(
    (candidate) => normalize(candidate.getAttribute("aria-label") ?? "") === labelText,
  );
  const label = [...document.querySelectorAll("label")].find((candidate) =>
    normalize(candidate.textContent ?? "").startsWith(labelText),
  );
  const input = explicitlyNamed ?? label?.querySelector("input, textarea, select");
  if (!input) throw new Error(`Could not find input for label: ${labelText}`);
  const prototype =
    input instanceof HTMLTextAreaElement
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

const setInputByTestId = ({ testId, value }) => {
  const input = document.querySelector(`[data-testid="${testId}"]`);
  if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) {
    throw new Error(`Could not find spreadsheet input: ${testId}`);
  }
  const prototype =
    input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error(`Input value setter is unavailable: ${testId}`);
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return input.value;
};

const clickControlByLabelText = (labelText) => {
  const normalize = (candidate) => candidate.replace(/\s+/g, " ").trim();
  const label = [...document.querySelectorAll("label")].find((candidate) =>
    normalize(candidate.textContent ?? "").startsWith(labelText),
  );
  const control = label?.querySelector("input, select, button");
  if (!control) throw new Error(`Could not find labeled control: ${labelText}`);
  control.click();
  return true;
};

const inputValueByLabel = (labelText) => {
  const normalize = (candidate) => candidate.replace(/\s+/g, " ").trim();
  const label = [...document.querySelectorAll("label")].find((candidate) =>
    normalize(candidate.textContent ?? "").startsWith(labelText),
  );
  const input = label?.querySelector("input, textarea, select");
  if (!input) throw new Error(`Could not find input for label: ${labelText}`);
  return input.value;
};

async function runWindowsScenario({ executable, outputDirectory, timeoutMs }) {
  const port = await reservePort();
  const profileDirectory = await mkdtemp(
    join(tmpdir(), "biofigurestat-native-regression-profile-"),
  );
  const exportTarget = join(outputDirectory, "native-command-export.svg");
  const dialogExportTarget = join(
    outputDirectory,
    `native-save-dialog-export-${Date.now()}.svg`,
  );
  const associationProjectTarget = join(
    outputDirectory,
    `native-file-association-${Date.now()}.lsa`,
  );
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
      steps.push({
        name,
        status: "fail",
        durationMs: Date.now() - startedAt,
        detail: String(error),
      });
      throw error;
    }
  };
  const requestNativeClose = async () => {
    await execFileAsync("powershell.exe", windowsCloseCommand(child.pid), {
      timeout: Math.min(timeoutMs, 20_000),
      windowsHide: true,
    });
  };
  const driveFileDialog = async (action, target = "") => {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      windowsFileDialogCommand(child.pid, action, target),
      {
        timeout: Math.max(25_000, Math.min(timeoutMs + 5_000, 120_000)),
        windowsHide: true,
      },
    );
    return stdout.trim() ? JSON.parse(stdout.trim()) : { ok: true, action };
  };

  try {
    const target = await runStep("native_webview_launch", () =>
      waitForTarget(port, timeoutMs, child),
    );
    const connection = await runStep("native_webview_cdp_connect", () =>
      connectToStableWebview(port, target, timeoutMs, child),
    );
    client = connection.client;
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
      if (!architecture || typeof architecture !== "string")
        throw new Error("Architecture IPC returned no value");
      return { architecture };
    });
    await runStep("home_has_no_japanese_application_copy", async () => {
      const findings = await client.evaluate(japaneseUiAuditExpression());
      if (findings.length)
        throw new Error(`Japanese application copy found: ${JSON.stringify(findings)}`);
      return { findings: 0 };
    });
    await runStep("native_export_ipc", async () => {
      const payload = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><title>native regression</title></svg>',
      );
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
    await runStep("open_graph_only_statistics_handoff", async () => {
      await client.evaluate(pageAction(clickByText, "New experiment"));
      await waitFor(
        client,
        `document.body.innerText.includes("Where would you like to start?")`,
        "New Experiment hub",
        timeoutMs,
      );
      await client.evaluate(`document.querySelector('[data-entry-id="graphOnly"] button').click()`);
      await waitFor(
        client,
        `document.body.innerText.includes("Create a Graph from your table")`,
        "Graph-only entry",
        timeoutMs,
      );
      const cells = [
        ["graph-only-cell-0-0", "Treatment"],
        ["graph-only-cell-0-1", "Measurement"],
        ["graph-only-cell-0-2", "sample ID"],
        ["graph-only-cell-1-0", "Vehicle"],
        ["graph-only-cell-1-1", "1.0"],
        ["graph-only-cell-1-2", "S01"],
        ["graph-only-cell-2-0", "Drug A"],
        ["graph-only-cell-2-1", "1.5"],
        ["graph-only-cell-2-2", "S02"],
        ["graph-only-cell-3-0", "Drug B"],
        ["graph-only-cell-3-1", "0.7"],
        ["graph-only-cell-3-2", "S03"],
      ];
      for (const [testId, value] of cells) {
        await client.evaluate(pageAction(setInputByTestId, { testId, value }));
      }
      await client.evaluate(pageAction(setInputByLabel, { labelText: "Graph X axis", value: "0" }));
      await client.evaluate(
        pageAction(setInputByLabel, { labelText: "Graph measured value", value: "1" }),
      );
      await client.evaluate(
        pageAction(setInputByLabel, { labelText: "Subject ID for Graph data", value: "2" }),
      );
      await client.evaluate(pageAction(clickByText, "Create Graph"));
      await waitFor(
        client,
        `document.body.innerText.includes("Review statistics")`,
        "Graph workspace",
        timeoutMs,
      );
      await runStep("graph_export_toolbar_is_ready", async () => {
        await waitFor(
          client,
          `[...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === "SVG" && !button.disabled)`,
          "enabled SVG export control after lazy Graph editor load",
          timeoutMs,
        );
        return { control: "SVG" };
      });
      await runStep("native_svg_save_dialog_cancel", async () => {
        await client.evaluate(pageAction(clickByText, "SVG"));
        const detail = await driveFileDialog("cancel");
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
        try {
          await readFile(dialogExportTarget);
          throw new Error("Cancel unexpectedly created an SVG file");
        } catch (error) {
          if (error && typeof error === "object" && error.code === "ENOENT") return detail;
          throw error;
        }
      });
      await runStep("native_svg_save_dialog_writes_selected_target", async () => {
        await client.evaluate(pageAction(clickByText, "SVG"));
        const detail = await driveFileDialog("save", dialogExportTarget);
        const written = await readFile(dialogExportTarget, "utf8");
        if (!written.includes("<svg")) throw new Error("Native Save dialog wrote invalid SVG");
        return { ...detail, target: dialogExportTarget, bytes: Buffer.byteLength(written) };
      });
      await runStep("native_project_save_dialog_writes_lsa", async () => {
        await client.evaluate(pageAction(clickByText, "Save"));
        const detail = await driveFileDialog("save", associationProjectTarget);
        const written = await readFile(associationProjectTarget);
        if (written.byteLength < 1_024) {
          throw new Error("Native project Save dialog wrote an unexpectedly small .lsa package");
        }
        return { ...detail, target: associationProjectTarget, bytes: written.byteLength };
      });
      await client.evaluate(pageAction(clickByText, "Review statistics"));
      await waitFor(
        client,
        `document.body.innerText.includes("Add experiment information required for statistics")`,
        "Graph-only Statistics handoff",
        timeoutMs,
      );
      await client.evaluate(pageAction(clickControlByLabelText, "Treatment or group"));
      await client.evaluate(
        pageAction(setInputByLabel, {
          labelText: "ID column identifying the subject or sample",
          value: "2",
        }),
      );
      await client.evaluate(pageAction(clickByText, "Continue to experiment structure"));
      await waitFor(
        client,
        `document.body.innerText.includes("Information needed for statistics")`,
        "biological structure questions",
        timeoutMs,
      );
      const findings = await client.evaluate(japaneseUiAuditExpression());
      if (findings.length)
        throw new Error(`Japanese application copy found: ${JSON.stringify(findings)}`);
      await captureScreenshot(client, join(outputDirectory, "graph-only-statistics-handoff.png"));
      return { findings: 0 };
    });
    await runStep("statistics_validation_is_visible_and_focused", async () => {
      await client.evaluate(
        pageAction(setInputByLabel, {
          labelText: "What unit directly received a condition or was assigned to a group?",
          value: "culture dish",
        }),
      );
      await client.evaluate(pageAction(clickByText, "Continue to statistics setup"));
      await waitFor(
        client,
        `document.activeElement?.getAttribute("role") === "alert" && document.activeElement?.closest("section")?.querySelector("#material-heading") !== null`,
        "inline relationship validation",
        timeoutMs,
      );
      const alertText = await client.evaluate(`document.activeElement?.textContent?.trim() ?? ""`);
      if (!alertText.includes("Select how subjects or specimens are related across conditions")) {
        throw new Error(`Unexpected Statistics validation: ${alertText}`);
      }
      // Give React's dirty-state effect one turn to publish to the native lifecycle
      // adapter after the retained Graph-only table and biological answer change.
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      return { alertText };
    });
    await runStep("native_close_requires_guard_and_cancel_retains_work", async () => {
      await requestNativeClose();
      await waitFor(
        client,
        `document.querySelector('.unsaved-changes-dialog') !== null`,
        "native close unsaved-work guard",
        timeoutMs,
      );
      const findings = await client.evaluate(japaneseUiAuditExpression());
      if (findings.length)
        throw new Error(`Japanese copy found in close guard: ${JSON.stringify(findings)}`);
      await client.evaluate(pageAction(clickByText, "Cancel"));
      await waitFor(
        client,
        `document.querySelector('.unsaved-changes-dialog') === null`,
        "close guard cancellation",
        timeoutMs,
      );
      const value = await client.evaluate(
        pageAction(
          inputValueByLabel,
          "What unit directly received a condition or was assigned to a group?",
        ),
      );
      if (value !== "culture dish")
        throw new Error("Cancel lost the retained biological-unit answer");
      return { retainedExperimentalUnit: value };
    });
    await runStep("native_close_discard_exits", async () => {
      await requestNativeClose();
      await waitFor(
        client,
        `document.querySelector('.unsaved-changes-dialog') !== null`,
        "second native close guard",
        timeoutMs,
      );
      await captureScreenshot(client, join(outputDirectory, "native-close-guard.png"));
      await client.evaluate(pageAction(clickByText, "Discard changes and continue"));
      await new Promise((resolvePromise, rejectPromise) => {
        const timeout = setTimeout(
          () => rejectPromise(new Error("Application did not exit after approved discard")),
          timeoutMs,
        );
        child.once("exit", (code) => {
          clearTimeout(timeout);
          if (code === 0 || code === null) resolvePromise();
          else rejectPromise(new Error(`Application exited with code ${code}`));
        });
      });
      return { exited: true };
    });
    await runStep("windows_lsa_command_line_open", async () => {
      const associationPort = await reservePort();
      const associationOutput = [];
      const associationChild = spawn(executable, [associationProjectTarget], {
        cwd: ROOT,
        env: {
          ...process.env,
          WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${associationPort} --remote-allow-origins=*`,
          WEBVIEW2_USER_DATA_FOLDER: profileDirectory,
        },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const collectAssociationOutput = (chunk) => associationOutput.push(String(chunk));
      associationChild.stdout?.on("data", collectAssociationOutput);
      associationChild.stderr?.on("data", collectAssociationOutput);
      let associationClient;
      try {
        const target = await waitForTarget(associationPort, timeoutMs, associationChild);
        const connection = await connectToStableWebview(
          associationPort,
          target,
          timeoutMs,
          associationChild,
        );
        associationClient = connection.client;
        await waitFor(
          associationClient,
          `(() => {
            const value = document.querySelector('[data-testid="graph-only-cell-1-0"]')?.value;
            const tabs = [...document.querySelectorAll('[role="tab"]')];
            const enabled = (name) => tabs.some((tab) => tab.textContent?.trim() === name && !tab.disabled);
            return value === "Vehicle" && enabled("Graph") && enabled("Statistics");
          })()`,
          ".lsa command-line open with editable data and enabled Graph/Statistics",
          timeoutMs,
        );
        await captureScreenshot(
          associationClient,
          join(outputDirectory, "lsa-command-line-open.png"),
        );
        return { target: associationProjectTarget, restoredValue: "Vehicle" };
      } finally {
        associationClient?.close();
        if (associationChild.exitCode === null && !associationChild.killed) associationChild.kill();
        const output = associationOutput.join("");
        if (output) {
          await writeFile(join(outputDirectory, "lsa-command-line-open-output.txt"), output, "utf8");
        }
      }
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
  return { steps, profileDirectory, exportTarget, dialogExportTarget, associationProjectTarget };
}

async function runMacAccessibility(action, names = [], value = "") {
  const { stdout } = await execFileAsync(
    "osascript",
    ["-l", "JavaScript", "-e", macAccessibilityScript(action, names, value)],
    {
      timeout: 20_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const output = stdout.trim();
  return output ? JSON.parse(output) : {};
}

async function waitForMacSnapshot(predicate, label, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Native macOS application exited before ${label} (code ${child.exitCode})`);
    }
    try {
      const snapshot = await runMacAccessibility("snapshot");
      if (predicate(snapshot)) return snapshot;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(
    `${label} was not exposed through macOS Accessibility: ${String(lastError ?? "timeout")}`,
  );
}

function macSnapshotContains(snapshot, candidates) {
  const text = snapshot.elements
    .flatMap((element) => [element.name, element.value, element.description])
    .join("\n");
  return candidates.some((candidate) => text.includes(candidate));
}

async function runMacScenario({ executable, outputDirectory, timeoutMs }) {
  const child = spawn(executable, [], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const nativeOutput = [];
  child.stdout?.on("data", (chunk) => nativeOutput.push(String(chunk)));
  child.stderr?.on("data", (chunk) => nativeOutput.push(String(chunk)));
  const steps = [];
  const runStep = async (name, action) => {
    const startedAt = Date.now();
    try {
      const detail = await action();
      steps.push({ name, status: "pass", durationMs: Date.now() - startedAt, detail });
      return detail;
    } catch (error) {
      steps.push({
        name,
        status: "fail",
        durationMs: Date.now() - startedAt,
        detail: String(error),
      });
      throw error;
    }
  };
  try {
    await runStep("macos_accessibility_attach", () =>
      waitForMacSnapshot(
        (snapshot) => snapshot.count > 0,
        "BioFigureStat native window",
        timeoutMs,
        child,
      ),
    );
    await runStep("macos_home_is_accessible", () =>
      waitForMacSnapshot(
        (snapshot) => macSnapshotContains(snapshot, ["New experiment", "新しい実験"]),
        "Home controls",
        timeoutMs,
        child,
      ),
    );
    await runStep("macos_open_simple_experiment", async () => {
      await runMacAccessibility("click", ["New experiment", "新しい実験"]);
      await waitForMacSnapshot(
        (snapshot) =>
          macSnapshotContains(snapshot, [
            "Simple independent-group comparison",
            "単純な独立群比較",
          ]),
        "simple experiment entry",
        timeoutMs,
        child,
      );
      return runMacAccessibility("click", [
        "Simple independent-group comparison",
        "単純な独立群比較",
      ]);
    });
    await runStep("macos_dirty_entry", async () => {
      await waitForMacSnapshot(
        (snapshot) => macSnapshotContains(snapshot, ["Experiment title", "実験タイトル"]),
        "experiment title field",
        timeoutMs,
        child,
      );
      const typingTarget = await runMacAccessibility(
        "type",
        ["Experiment title", "実験タイトル", "実験タイトル（任意）"],
        "Native macOS regression experiment",
      );
      // WKWebView text fields do not consistently expose their current value through macOS
      // Accessibility even when the keystrokes reached React. The product contract under test is
      // the dirty lifecycle, so confirm the edit through the native quit guard in the next steps
      // instead of treating an AX value-read limitation as a product failure.
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      return { typingTarget, confirmation: "native_unsaved_guard" };
    });
    await runStep("macos_quit_guard_cancel_retains_work", async () => {
      await runMacAccessibility("quit");
      await waitForMacSnapshot(
        (snapshot) => macSnapshotContains(snapshot, ["Cancel", "キャンセル"]),
        "unsaved-work guard",
        timeoutMs,
        child,
      );
      await runMacAccessibility("click", ["Cancel", "キャンセル"]);
      return waitForMacSnapshot(
        (snapshot) => macSnapshotContains(snapshot, ["Experiment title", "実験タイトル"]),
        "experiment entry after guard cancellation",
        timeoutMs,
        child,
      );
    });
    await runStep("macos_quit_guard_discard_exits", async () => {
      await runMacAccessibility("quit");
      await waitForMacSnapshot(
        (snapshot) =>
          macSnapshotContains(snapshot, ["Discard changes and continue", "変更を破棄して続ける"]),
        "second unsaved-work guard",
        timeoutMs,
        child,
      );
      await runMacAccessibility("click", ["Discard changes and continue", "変更を破棄して続ける"]);
      await new Promise((resolvePromise, rejectPromise) => {
        const timer = setTimeout(
          () => rejectPromise(new Error("macOS application did not exit after discard")),
          timeoutMs,
        );
        child.once("exit", (code) => {
          clearTimeout(timer);
          if (code === 0 || code === null) resolvePromise();
          else rejectPromise(new Error(`macOS application exited with code ${code}`));
        });
      });
      return { exited: true };
    });
  } catch (error) {
    if (nativeOutput.length) {
      await writeFile(join(outputDirectory, "native-output.txt"), nativeOutput.join(""), "utf8");
    }
    if (error && typeof error === "object") error.nativeSteps = steps;
    throw error;
  } finally {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  return { steps };
}

export async function runNativeUiRegression(options) {
  let executable = resolve(options.executable ?? defaultNativeExecutable(options.platform));
  const outputDirectory = resolve(
    options.output ??
      join(ROOT, ".tmp", "native-ui-regression", new Date().toISOString().replaceAll(":", "-")),
  );
  await mkdir(outputDirectory, { recursive: true });
  const startedAt = new Date().toISOString();
  let result;
  let failure;
  try {
    executable = await resolveNativeExecutable(options.platform, options.executable);
    if (!isAbsolute(executable)) throw new Error("Native executable path must be absolute");
    result = await (options.platform === "macos" ? runMacScenario : runWindowsScenario)({
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
  await writeFile(
    join(outputDirectory, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  if (failure)
    throw new Error(
      `${failure}\nNative regression report: ${join(outputDirectory, "report.json")}`,
    );
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
