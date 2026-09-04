import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, win32 } from "node:path";
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
    nativeFileDialogSaveTargets: false,
    associationProject: undefined,
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
    } else if (argument === "--native-file-dialog-save-targets") {
      parsed.nativeFileDialogSaveTargets = true;
    } else if (argument === "--association-project" && value) {
      parsed.associationProject = value;
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
  if (parsed.associationProject && !win32.isAbsolute(parsed.associationProject)) {
    throw new Error("--association-project must be an absolute path");
  }
  return parsed;
}

export function defaultNativeExecutable(platform) {
  if (platform === "windows") return DEFAULT_WINDOWS_EXECUTABLE;
  return DEFAULT_MAC_APP;
}

export function validateEquivalenceBoundaryResult(result, expected) {
  const comparison = result?.equivalence?.comparisons?.[0];
  if (
    result?.status !== "ok" ||
    result?.protocolVersion !== expected.protocolVersion ||
    comparison?.conclusion !== "equivalence_supported"
  ) {
    throw new Error(`Native ${expected.label} IPC returned an unexpected result`);
  }
  if (expected.analysisSet) {
    const analysisSet = comparison?.analysisSet;
    if (
      analysisSet?.completePairCount !== expected.analysisSet.completePairCount ||
      JSON.stringify(analysisSet?.excludedIncompletePairIds) !==
        JSON.stringify(expected.analysisSet.excludedIncompletePairIds)
    ) {
      throw new Error(`Native ${expected.label} IPC changed the paired analysis set`);
    }
  }
  return {
    protocolVersion: result.protocolVersion,
    status: result.status,
    conclusion: comparison.conclusion,
    ...(expected.analysisSet ? { analysisSet: comparison.analysisSet } : {}),
  };
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
    const looksLikeUserPath = (value) =>
      /^[A-Za-z]:[\\\\/]/u.test(value) || /^\\\\\\\\/u.test(value) || /^\//u.test(value);
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
    for (const element of document.querySelectorAll("[aria-label], [aria-description], [title], [placeholder], [alt]")) {
      for (const attribute of ["aria-label", "aria-description", "title", "placeholder", "alt"]) {
        const value = element.getAttribute(attribute)?.trim() ?? "";
        if (!value || !pattern.test(value) || looksLikeUserPath(value)) continue;
        findings.push({ kind: attribute, value: value.slice(0, 160), tag: element.tagName });
      }
    }
    for (const element of document.querySelectorAll("input:not([type='hidden']), textarea")) {
      const value = element.value?.trim() ?? "";
      if (!value || !pattern.test(value) || looksLikeUserPath(value)) continue;
      findings.push({ kind: "editable-value", value: value.slice(0, 160), tag: element.tagName });
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

export function summarizeWebviewTargets(targets) {
  return targets
    .filter((target) => target.type === "page")
    .map((target) => ({
      id: typeof target.id === "string" ? target.id : "",
      url: typeof target.url === "string" ? target.url : "",
      websocket: typeof target.webSocketDebuggerUrl === "string",
    }));
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

export function windowsAssociationLaunchCommand(projectPath) {
  if (!win32.isAbsolute(projectPath)) {
    throw new Error("Association project path must be absolute");
  }
  const encodedPath = Buffer.from(projectPath, "utf8").toString("base64");
  return [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `
$projectPath = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPath}'))
$launched = Start-Process -FilePath $projectPath -PassThru
Start-Sleep -Milliseconds 500
$launched.Refresh()
if ($launched.HasExited) { throw 'Associated application exited during launch' }
[PSCustomObject]@{ pid = $launched.Id; path = $launched.Path } | ConvertTo-Json -Compress
`,
  ];
}

export function windowsFileDialogCommand(processId, action, target = "") {
  if (!Number.isSafeInteger(processId) || processId <= 0) {
    throw new Error("Windows file-dialog process ID must be a positive integer");
  }
  if (!new Set(["cancel", "save"]).has(action)) {
    throw new Error(`Unsupported Windows file-dialog action: ${action}`);
  }
  if (action === "save" && !win32.isAbsolute(target)) {
    throw new Error("Windows file-dialog save target must be absolute");
  }
  const encodedTarget = Buffer.from(target, "utf16le").toString("base64");
  const script = String.raw`
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  Add-Type -AssemblyName System.Drawing
  Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class BioFigureStatNativeWindowOwner {
  [StructLayout(LayoutKind.Sequential)]
  public struct KeyboardInput {
    public ushort virtualKey;
    public ushort scanCode;
    public uint flags;
    public uint time;
    public IntPtr extraInfo;
  }
  [StructLayout(LayoutKind.Explicit)]
  public struct InputUnion {
    [FieldOffset(0)] public KeyboardInput keyboard;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct Input {
    public uint type;
    public InputUnion data;
  }
  [DllImport("user32.dll")]
  public static extern IntPtr GetWindow(IntPtr window, uint command);
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")]
  public static extern bool PostMessage(IntPtr window, uint message, IntPtr word, IntPtr data);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")]
  public static extern bool BringWindowToTop(IntPtr window);
  [DllImport("kernel32.dll")]
  public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")]
  public static extern bool AttachThreadInput(uint sourceThread, uint targetThread, bool attach);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint SendInput(uint count, Input[] inputs, int size);

  private static Input Key(ushort virtualKey, ushort scanCode, uint flags) {
    return new Input {
      type = 1,
      data = new InputUnion {
        keyboard = new KeyboardInput {
          virtualKey = virtualKey,
          scanCode = scanCode,
          flags = flags,
          time = 0,
          extraInfo = IntPtr.Zero
        }
      }
    };
  }

  public static void ReplaceFocusedText(string value) {
    const uint keyUp = 0x0002;
    const uint unicode = 0x0004;
    var inputs = new System.Collections.Generic.List<Input>();
    inputs.Add(Key(0x11, 0, 0));
    inputs.Add(Key(0x41, 0, 0));
    inputs.Add(Key(0x41, 0, keyUp));
    inputs.Add(Key(0x11, 0, keyUp));
    foreach (char character in value) {
      inputs.Add(Key(0, character, unicode));
      inputs.Add(Key(0, character, unicode | keyUp));
    }
    var array = inputs.ToArray();
    var sent = SendInput((uint)array.Length, array, Marshal.SizeOf(typeof(Input)));
    if (sent != (uint)array.Length) {
      throw new InvalidOperationException("SendInput accepted " + sent + " of " + array.Length + " events");
    }
  }

  public static void FocusFileNameInput() {
    const uint keyUp = 0x0002;
    var inputs = new Input[] {
      Key(0x12, 0, 0),
      Key(0x4E, 0, 0),
      Key(0x4E, 0, keyUp),
      Key(0x12, 0, keyUp)
    };
    var sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input)));
    if (sent != (uint)inputs.Length) {
      throw new InvalidOperationException("SendInput accepted " + sent + " of " + inputs.Length + " accelerator events");
    }
  }

  public static void PressEnter() {
    const uint keyUp = 0x0002;
    var inputs = new Input[] {
      Key(0x0D, 0, 0),
      Key(0x0D, 0, keyUp)
    };
    var sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(Input)));
    if (sent != (uint)inputs.Length) {
      throw new InvalidOperationException("SendInput accepted " + sent + " of " + inputs.Length + " Enter events");
    }
  }

  public static bool FocusWindow(IntPtr window) {
    uint processId;
    var targetThread = GetWindowThreadProcessId(window, out processId);
    var currentThread = GetCurrentThreadId();
    var attached = targetThread != 0 && targetThread != currentThread &&
      AttachThreadInput(currentThread, targetThread, true);
    try {
      BringWindowToTop(window);
      return SetForegroundWindow(window);
    } finally {
      if (attached) AttachThreadInput(currentThread, targetThread, false);
    }
  }
}
'@
} catch {
  throw 'HARNESS_FILE_DIALOG_AUTOMATION: Windows UI Automation is unavailable: ' + $_.Exception.Message
}
$processId = ${processId}
$action = '${action}'
$target = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${encodedTarget}'))
$desktop = [Windows.Automation.AutomationElement]::RootElement
$windowTypeCondition = [Windows.Automation.PropertyCondition]::new(
  [Windows.Automation.AutomationElement]::ControlTypeProperty,
  [Windows.Automation.ControlType]::Window
)
$deadline = [DateTime]::UtcNow.AddSeconds(20)
$dialog = $null
$observedCandidates = @()
$observedWindows = @()
$appWindowSeen = $false
while ([DateTime]::UtcNow -lt $deadline -and $null -eq $dialog) {
  $topLevelWindows = $desktop.FindAll([Windows.Automation.TreeScope]::Children, $windowTypeCondition)
  $windows = @($topLevelWindows)
  foreach ($appRoot in $topLevelWindows) {
    if ($appRoot.Current.ProcessId -ne $processId) { continue }
    $appWindowSeen = $true
    $windows += @($appRoot.FindAll([Windows.Automation.TreeScope]::Descendants, $windowTypeCondition))
  }
  foreach ($window in $windows) {
    if ($window.Current.ProcessId -eq $processId) { $appWindowSeen = $true }
    if ($window.Current.ProcessId -eq $processId -or $window.Current.Name -match 'Save|保存|書き出し|BioFigureStat') {
      $observedWindows += @{
        name = $window.Current.Name
        className = $window.Current.ClassName
        processId = $window.Current.ProcessId
      }
    }
    $looksLikeDialog = $window.Current.ClassName -eq '#32770' -or $window.Current.Name -match 'Save|保存|書き出し'
    if (-not $looksLikeDialog) { continue }
    $ownerProcessId = 0
    $nativeHandle = [IntPtr]$window.Current.NativeWindowHandle
    $ownerHandle = [BioFigureStatNativeWindowOwner]::GetWindow($nativeHandle, 4)
    if ($ownerHandle -ne [IntPtr]::Zero) {
      [void][BioFigureStatNativeWindowOwner]::GetWindowThreadProcessId($ownerHandle, [ref]$ownerProcessId)
    }
    $observedCandidates += @{
      name = $window.Current.Name
      className = $window.Current.ClassName
      processId = $window.Current.ProcessId
      ownerProcessId = $ownerProcessId
    }
    if ($window.Current.ProcessId -eq $processId -or $ownerProcessId -eq $processId) {
      $dialog = $window
      break
    }
  }
  if ($null -eq $dialog) { Start-Sleep -Milliseconds 100 }
}
if ($null -eq $dialog) {
  $summary = ConvertTo-Json @($observedWindows | Select-Object -Last 20) -Compress
  if (-not $appWindowSeen) {
    throw ('HARNESS_FILE_DIALOG_AUTOMATION: spawned BioFigureStat window is not visible to Windows UI Automation; windows=' + $summary)
  }
  throw ('FILE_DIALOG_NOT_FOUND: native Save dialog did not appear; candidates=' + $summary)
}
if ($action -eq 'cancel') {
  [void][BioFigureStatNativeWindowOwner]::PostMessage(
    [IntPtr]$dialog.Current.NativeWindowHandle,
    0x0100,
    [IntPtr]27,
    [IntPtr]0
  )
  [void][BioFigureStatNativeWindowOwner]::PostMessage(
    [IntPtr]$dialog.Current.NativeWindowHandle,
    0x0101,
    [IntPtr]27,
    [IntPtr]0
  )
  Start-Sleep -Milliseconds 250
} else {
  $dialogHandle = [IntPtr]$dialog.Current.NativeWindowHandle
  $foregroundAccepted = $null
  $fileNameInputMethod = 'AltNUnicodeKeyboard'
  $inputStage = 'focus'
  try {
    $foregroundAccepted = [BioFigureStatNativeWindowOwner]::FocusWindow($dialogHandle)
    $inputStage = 'accelerator'
    [BioFigureStatNativeWindowOwner]::FocusFileNameInput()
    Start-Sleep -Milliseconds 100
    $selectedEdit = [Windows.Automation.AutomationElement]::FocusedElement
    $selectedEditName = if ($null -ne $selectedEdit) { $selectedEdit.Current.Name } else { '' }
    $selectedEditId = if ($null -ne $selectedEdit) { $selectedEdit.Current.AutomationId } else { '' }
    $selectedEditBounds = if ($null -ne $selectedEdit) { $selectedEdit.Current.BoundingRectangle } else { $null }
    $inputStage = 'text'
    [BioFigureStatNativeWindowOwner]::ReplaceFocusedText($target)
    Start-Sleep -Milliseconds 100
  } catch {
    $innerHResult = if ($null -ne $_.Exception.InnerException) {
      $_.Exception.InnerException.HResult
    } else {
      0
    }
    throw ('HARNESS_FILE_DIALOG_AUTOMATION: Unicode keyboard input failed;stage=' + $inputStage + ';hresult=' + $_.Exception.HResult + ';innerHResult=' + $innerHResult + ';control=' + $selectedEditId)
  }
  $dialogEvidencePath = $target + '.dialog.png'
  $dialogBounds = $dialog.Current.BoundingRectangle
  $bitmap = [Drawing.Bitmap]::new([int]$dialogBounds.Width, [int]$dialogBounds.Height)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen(
      [int]$dialogBounds.X,
      [int]$dialogBounds.Y,
      0,
      0,
      $bitmap.Size
    )
    $bitmap.Save($dialogEvidencePath, [Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
  try {
    [BioFigureStatNativeWindowOwner]::PressEnter()
    Start-Sleep -Milliseconds 250
  } catch {
    throw ('FILE_DIALOG_CONTROL_NOT_FOUND: Save Enter failed: ' + $_.Exception.Message)
  }
}
$result = @{ ok = $true; action = $action; dialog = $dialog.Current.Name }
if ($action -eq 'save') {
  $result.fileNameControl = $selectedEditName
  $result.fileNameAutomationId = $selectedEditId
  $result.fileNameInputMethod = $fileNameInputMethod
  $result.foregroundAccepted = $foregroundAccepted
  if ($null -ne $selectedEditBounds) {
    $result.fileNameBounds = @{
      x = $selectedEditBounds.X
      y = $selectedEditBounds.Y
      width = $selectedEditBounds.Width
      height = $selectedEditBounds.Height
    }
  }
  $result.dialogEvidenceFile = [IO.Path]::GetFileName($dialogEvidencePath)
}
[Console]::Out.Write((ConvertTo-Json $result -Compress))
`;
  return ["-NoProfile", "-NonInteractive", "-Command", script];
}

export function windowsFileDialogFailure(error) {
  const stderr = typeof error?.stderr === "string" ? error.stderr : "";
  const marker = stderr.match(
    /(?:HARNESS_FILE_DIALOG_AUTOMATION|FILE_DIALOG_(?:NOT_FOUND|CONTROL_NOT_FOUND)):[^\r\n]*/i,
  )?.[0];
  if (marker) return new Error(marker);
  const detail = stderr.trim().split(/\r?\n/u).filter(Boolean).at(-1) ?? String(error);
  return new Error(`HARNESS_FILE_DIALOG_AUTOMATION: Windows dialog control failed: ${detail}`);
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
  se.keystroke("q", { using: ["command down"] });
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
    se.keystroke("a", { using: ["command down"] });
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

  async connect(timeoutMs = 2_000) {
    await new Promise((resolvePromise, rejectPromise) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      let settled = false;
      const finish = (action, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.removeEventListener("open", onOpen);
        socket.removeEventListener("error", onError);
        action(value);
      };
      const onOpen = () => finish(resolvePromise);
      const onError = () => finish(rejectPromise, new Error("Could not connect to WebView2 CDP"));
      const timer = setTimeout(() => {
        finish(
          rejectPromise,
          new Error(`Timed out connecting to WebView2 CDP after ${timeoutMs} ms`),
        );
        try {
          socket.close();
        } catch (_) {}
      }, timeoutMs);
      socket.addEventListener("open", onOpen);
      socket.addEventListener("error", onError);
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
  let target = initialTarget;
  let lastConnectionError;
  let lastDiscoveryError;
  const targetTransitions = [];
  const recordTargets = (targets) => {
    const summary = summarizeWebviewTargets(targets);
    const encoded = JSON.stringify(summary);
    if (targetTransitions.at(-1)?.encoded !== encoded && targetTransitions.length < 12) {
      targetTransitions.push({ encoded, summary });
    }
  };
  recordTargets(initialTarget ? [initialTarget] : []);
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Native application exited before WebView inspection (code ${child.exitCode})`,
      );
    }
    if (target) {
      const candidate = new CdpClient(target.webSocketDebuggerUrl);
      try {
        await candidate.connect(Math.max(250, Math.min(2_000, deadline - Date.now())));
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
        lastConnectionError = error;
        candidate.close();
      }
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        recordTargets(targets);
        target = selectWebviewTarget(targets);
      } else {
        lastDiscoveryError = new Error(`CDP discovery returned HTTP ${response.status}`);
      }
    } catch (error) {
      lastDiscoveryError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150));
  }
  throw new Error(
    `WebView2 CDP target never became stable; connection=${String(lastConnectionError)}; discovery=${String(lastDiscoveryError)}; targetTransitions=${JSON.stringify(targetTransitions.map(({ summary }) => summary))}`,
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

async function waitForReadableFile(target, label, timeoutMs, encoding) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await readFile(target, encoding);
    } catch (error) {
      lastError = error;
      if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Timed out waiting for ${label}: ${String(lastError)}`);
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

async function runWindowsScenario({
  executable,
  outputDirectory,
  timeoutMs,
  nativeFileDialogSaveTargets,
}) {
  const port = await reservePort();
  const profileDirectory = await mkdtemp(
    join(tmpdir(), "biofigurestat-native-regression-profile-"),
  );
  const exportTarget = join(outputDirectory, "native-command-export.svg");
  const dialogExportTarget = join(outputDirectory, `native-save-dialog-export-${Date.now()}.svg`);
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
    try {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        windowsFileDialogCommand(child.pid, action, target),
        {
          timeout: Math.max(25_000, Math.min(timeoutMs + 5_000, 120_000)),
          windowsHide: true,
        },
      );
      return stdout.trim() ? JSON.parse(stdout.trim()) : { ok: true, action };
    } catch (error) {
      throw windowsFileDialogFailure(error);
    }
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
    const equivalenceBoundaryCases = [
      {
        step: "native_welch_tost_ipc",
        label: "Welch TOST",
        fixture: "welch-tost-equivalence-supported-request.json",
        protocolVersion: "0.15.0",
      },
      {
        step: "native_paired_tost_ipc",
        label: "paired TOST",
        fixture: "paired-tost-equivalence-supported-request.json",
        protocolVersion: "0.16.0",
        analysisSet: {
          completePairCount: 6,
          excludedIncompletePairIds: ["pair.incomplete"],
        },
      },
    ];
    for (const boundaryCase of equivalenceBoundaryCases) {
      await runStep(boundaryCase.step, async () => {
        const request = JSON.parse(
          await readFile(
            join(ROOT, "engine", "python", "smoke_fixtures", boundaryCase.fixture),
            "utf8",
          ),
        );
        const result = await client.evaluate(
          `window.__TAURI_INTERNALS__.invoke("run_analysis", ${JSON.stringify({ request })})`,
        );
        return validateEquivalenceBoundaryResult(result, boundaryCase);
      });
    }
    await runStep("home_has_no_japanese_application_copy", async () => {
      const findings = await client.evaluate(japaneseUiAuditExpression());
      if (findings.length)
        throw new Error(`Japanese application copy found: ${JSON.stringify(findings)}`);
      return { findings: 0 };
    });
    await runStep("native_project_open_dialog_cancel", async () => {
      await client.evaluate(
        `document.querySelector('[data-primary-route="open-project"]')?.click()`,
      );
      const detail = await driveFileDialog("cancel");
      return { ...detail, retainedApplication: true };
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
          `["SVG", "PNG", "CSV"].every((label) => [...document.querySelectorAll("button")].some((button) => button.textContent?.trim() === label && !button.disabled))`,
          "enabled SVG, PNG, and CSV export controls after lazy Graph editor load",
          timeoutMs,
        );
        return { controls: ["SVG", "PNG", "CSV"] };
      });
      for (const control of ["SVG", "PNG", "CSV"]) {
        await runStep(`native_${control.toLowerCase()}_save_dialog_cancel`, async () => {
          await client.evaluate(pageAction(clickByText, control));
          const detail = await driveFileDialog("cancel");
          return { ...detail, control, retainedApplication: true };
        });
      }
      if (nativeFileDialogSaveTargets)
        await runStep("native_svg_save_dialog_writes_selected_target", async () => {
          await client.evaluate(pageAction(clickByText, "SVG"));
          const detail = await driveFileDialog("save", dialogExportTarget);
          let written;
          try {
            written = await waitForReadableFile(
              dialogExportTarget,
              "SVG selected in the native Save dialog",
              timeoutMs,
              "utf8",
            );
          } catch (error) {
            throw new Error(`${String(error)}; dialog=${JSON.stringify(detail)}`);
          }
          if (!written.includes("<svg")) throw new Error("Native Save dialog wrote invalid SVG");
          return { ...detail, target: dialogExportTarget, bytes: Buffer.byteLength(written) };
        });
      if (nativeFileDialogSaveTargets)
        await runStep("native_project_save_dialog_writes_lsa", async () => {
          await client.evaluate(pageAction(clickByText, "Save"));
          const detail = await driveFileDialog("save", associationProjectTarget);
          const written = await waitForReadableFile(
            associationProjectTarget,
            ".lsa selected in the native Save dialog",
            timeoutMs,
          );
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
    if (nativeFileDialogSaveTargets)
      await runStep("windows_lsa_command_line_open", async () => {
        const associationPort = await reservePort();
        const associationOutput = [];
        const associationEnvironment = {
          ...process.env,
          WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${associationPort} --remote-allow-origins=*`,
          WEBVIEW2_USER_DATA_FOLDER: profileDirectory,
        };
        const associationChild = spawn(executable, [associationProjectTarget], {
          cwd: ROOT,
          env: associationEnvironment,
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
            const workspaceTabs = [...document.querySelectorAll('button, [role="tab"]')];
            const enabled = (name) => workspaceTabs.some(
              (tab) => tab.textContent?.trim() === name && !tab.disabled,
            );
            return value === "Vehicle" && enabled("Graph") && enabled("Statistics");
          })()`,
            ".lsa command-line open with editable data and enabled Graph/Statistics",
            timeoutMs,
          );
          await captureScreenshot(
            associationClient,
            join(outputDirectory, "lsa-command-line-open.png"),
          );
          return {
            target: associationProjectTarget,
            restoredValue: "Vehicle",
          };
        } catch (error) {
          if (associationClient) {
            try {
              await captureScreenshot(
                associationClient,
                join(outputDirectory, "lsa-command-line-open-failure.png"),
              );
              const state = await associationClient.evaluate(`({
              body: document.body?.innerText ?? "",
              href: location.href,
              title: document.title,
              graphOnlyValue: document.querySelector('[data-testid="graph-only-cell-1-0"]')?.value ?? null,
              tabs: [...document.querySelectorAll('[role="tab"]')].map((tab) => ({
                text: tab.textContent?.trim() ?? "",
                disabled: Boolean(tab.disabled),
              })),
            })`);
              await writeFile(
                join(outputDirectory, "lsa-command-line-open-failure.json"),
                `${JSON.stringify(state, null, 2)}\n`,
                "utf8",
              );
            } catch {
              // Preserve the command-line open failure if diagnostic capture also fails.
            }
          }
          throw error;
        } finally {
          associationClient?.close();
          if (associationChild.exitCode === null && !associationChild.killed) {
            associationChild.kill();
          }
          const output = associationOutput.join("");
          if (output) {
            await writeFile(
              join(outputDirectory, "lsa-command-line-open-output.txt"),
              output,
              "utf8",
            );
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

async function runWindowsInstalledAssociationScenario({
  executable,
  projectPath,
  outputDirectory,
  timeoutMs,
}) {
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
      if (error && typeof error === "object") error.nativeSteps = steps;
      throw error;
    }
  };
  const port = await reservePort();
  const profileDirectory = await mkdtemp(
    join(tmpdir(), "biofigurestat-installed-association-profile-"),
  );
  const associationEnvironment = {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-allow-origins=*`,
    WEBVIEW2_USER_DATA_FOLDER: profileDirectory,
  };
  let associatedProcessId;
  let client;
  try {
    const launch = await runStep("windows_lsa_shell_launch", async () => {
      const { stdout } = await execFileAsync(
        "powershell.exe",
        windowsAssociationLaunchCommand(projectPath),
        {
          cwd: ROOT,
          env: associationEnvironment,
          timeout: Math.min(timeoutMs, 20_000),
          windowsHide: true,
        },
      );
      const detail = JSON.parse(stdout.trim());
      associatedProcessId = Number(detail.pid);
      const launchedExecutable = resolve(String(detail.path));
      if (
        !Number.isInteger(associatedProcessId) ||
        associatedProcessId <= 0 ||
        launchedExecutable.toLowerCase() !== resolve(executable).toLowerCase()
      ) {
        throw new Error(`Windows .lsa association launched an unexpected target: ${stdout}`);
      }
      return {
        processId: associatedProcessId,
        executable: launchedExecutable,
        projectPath,
        launchMode: "windows_shell_association",
      };
    });
    const processProbe = { exitCode: null };
    const target = await runStep("windows_lsa_webview_launch", () =>
      waitForTarget(port, timeoutMs, processProbe),
    );
    const connection = await runStep("windows_lsa_webview_connect", () =>
      connectToStableWebview(port, target, timeoutMs, processProbe),
    );
    client = connection.client;
    await runStep("windows_lsa_first_use_consent_dismissed", async () => {
      const dismissed = await client.evaluate(`(() => {
        const labels = new Set(["協力しない", "Don't participate"]);
        const button = [...document.querySelectorAll('button')].find(
          (candidate) => labels.has(candidate.textContent?.trim() ?? ""),
        );
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (dismissed) {
        await waitFor(
          client,
          `![...document.querySelectorAll('button')].some((button) => ["協力しない", "Don't participate"].includes(button.textContent?.trim() ?? ""))`,
          "first-use consent dismissal",
          timeoutMs,
        );
      }
      return { shown: dismissed, choice: dismissed ? "opted_out" : "already_recorded" };
    });
    await runStep("windows_lsa_data_and_tabs_restored", async () => {
      await client.evaluate(`(() => {
        const labels = new Set(["Data", "データ"]);
        const tab = [...document.querySelectorAll('button, [role="tab"]')].find(
          (candidate) => labels.has(candidate.textContent?.trim() ?? ""),
        );
        tab?.click();
      })()`);
      await waitFor(
        client,
        `(() => {
          const value = document.querySelector('[data-testid="graph-only-cell-1-0"]')?.value;
          const tabs = [...document.querySelectorAll('button, [role="tab"]')];
          const enabled = (names) => tabs.some(
            (tab) => names.includes(tab.textContent?.trim() ?? "") && !tab.disabled,
          );
          return value === "Vehicle" &&
            enabled(["Graph", "グラフ"]) &&
            enabled(["Statistics", "統計"]);
        })()`,
        "installed .lsa data and enabled Graph/Statistics tabs",
        timeoutMs,
      );
      return { restoredValue: "Vehicle", tabs: ["Graph", "Statistics"] };
    });
    await runStep("windows_lsa_saved_graph_restored", async () => {
      await client.evaluate(`(() => {
        const labels = new Set(["Graph", "グラフ"]);
        const tab = [...document.querySelectorAll('button, [role="tab"]')].find(
          (candidate) => labels.has(candidate.textContent?.trim() ?? ""),
        );
        if (!tab) throw new Error("Graph tab was not found after association open");
        tab.click();
      })()`);
      await waitFor(
        client,
        `(() => {
          const exportButtons = [...document.querySelectorAll('button')];
          return document.querySelector('svg') !== null &&
            ["SVG", "PNG", "CSV"].every((name) => exportButtons.some(
              (button) => button.textContent?.trim() === name && !button.disabled,
            ));
        })()`,
        "saved Graph and export controls after installed association open",
        timeoutMs,
      );
      await captureScreenshot(client, join(outputDirectory, "installed-lsa-graph.png"));
      return { graphRestored: true, exportControls: ["SVG", "PNG", "CSV"] };
    });
    return { steps, profileDirectory, launch };
  } catch (error) {
    if (client) {
      try {
        await captureScreenshot(client, join(outputDirectory, "installed-lsa-failure.png"));
      } catch {
        // Preserve the association failure if screenshot capture also fails.
      }
    }
    if (error && typeof error === "object") error.nativeSteps = steps;
    throw error;
  } finally {
    client?.close();
    if (associatedProcessId) {
      try {
        await execFileAsync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `$process = Get-Process -Id ${associatedProcessId} -ErrorAction Stop; if ($process.CloseMainWindow()) { Wait-Process -Id ${associatedProcessId} -Timeout 15 -ErrorAction Stop }`,
          ],
          { timeout: 20_000, windowsHide: true },
        );
      } catch {
        // Report the inspection result; never terminate an unrelated process as fallback.
      }
    }
  }
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

export function macSnapshotContains(snapshot, candidates) {
  const text = snapshot.elements
    .flatMap((element) => [element.name, element.value, element.description])
    .join("\n");
  return candidates.some((candidate) => text.includes(candidate));
}

export function macUnsavedGuardIsDismissed(snapshot) {
  return !macSnapshotContains(snapshot, ["Discard changes and continue", "変更を破棄して続ける"]);
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
      const snapshot = await waitForMacSnapshot(
        (candidate) =>
          macSnapshotContains(candidate, ["Experiment title", "実験タイトル"]) &&
          macUnsavedGuardIsDismissed(candidate),
        "experiment entry after guard cancellation",
        timeoutMs,
        child,
      );
      // The title field remains exposed behind the modal, so it cannot by itself prove that
      // cancellation completed. The predicate above waits for the dialog-only discard action to
      // disappear; one further snapshot restores the app as the frontmost process before Cmd+Q.
      await runMacAccessibility("snapshot");
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      return snapshot;
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
    if (options.associationProject) {
      if (options.platform !== "windows") {
        throw new Error("--association-project is currently supported only on Windows");
      }
      result = await runWindowsInstalledAssociationScenario({
        executable,
        projectPath: resolve(options.associationProject),
        outputDirectory,
        timeoutMs: options.timeoutMs,
      });
    } else {
      result = await (options.platform === "macos" ? runMacScenario : runWindowsScenario)({
        executable,
        outputDirectory,
        timeoutMs: options.timeoutMs,
        nativeFileDialogSaveTargets: options.nativeFileDialogSaveTargets,
      });
    }
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
