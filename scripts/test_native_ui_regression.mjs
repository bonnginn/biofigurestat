import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyNativeRegressionFailure,
  defaultNativeExecutable,
  japaneseUiAuditExpression,
  macBundleExecutableFromPlist,
  macAccessibilityScript,
  parseNativeRegressionArguments,
  resolveNativeExecutable,
  selectWebviewTarget,
  windowsCloseCommand,
  windowsFileDialogCommand,
  windowsFileDialogFailure,
} from "./native_ui_regression.mjs";

test("parses a bounded Windows native regression invocation", () => {
  assert.deepEqual(
    parseNativeRegressionArguments([
      "--platform",
      "windows",
      "--executable",
      "C:\\build\\BioFigureStat.exe",
      "--output",
      "C:\\evidence",
      "--timeout-ms",
      "30000",
    ]),
    {
      platform: "windows",
      executable: "C:\\build\\BioFigureStat.exe",
      output: "C:\\evidence",
      timeoutMs: 30000,
    },
  );
});

test("rejects unsupported platforms and unbounded timeouts", () => {
  assert.throws(
    () => parseNativeRegressionArguments(["--platform", "linux"]),
    /Unsupported native regression platform/,
  );
  assert.throws(
    () => parseNativeRegressionArguments(["--timeout-ms", "999"]),
    /between 1000 and 120000/,
  );
});

test("uses the packaged Windows application as its default exact target", () => {
  assert.match(
    defaultNativeExecutable("windows"),
    /target[\\/]release[\\/]lifescience-analysis-app\.exe$/,
  );
});

test("requests an actual bounded Windows WM_CLOSE for the exact spawned process", () => {
  const command = windowsCloseCommand(4242);
  assert.deepEqual(command.slice(0, 2), ["-NoProfile", "-NonInteractive"]);
  assert.match(command.at(-1), /Get-Process -Id 4242/);
  assert.match(command.at(-1), /CloseMainWindow/);
  assert.throws(() => windowsCloseCommand(0), /positive integer/);
});

test("drives only the exact spawned process native Save dialog with encoded paths", () => {
  const target = "C:\\evidence\\日本語 ' quote\\figure.svg";
  const saveCommand = windowsFileDialogCommand(4242, "save", target);
  assert.deepEqual(saveCommand.slice(0, 2), ["-NoProfile", "-NonInteractive"]);
  assert.match(saveCommand.at(-1), /\$processId = 4242/);
  assert.match(saveCommand.at(-1), /UIAutomationClient/);
  assert.match(saveCommand.at(-1), /BioFigureStatNativeWindowOwner/);
  assert.match(saveCommand.at(-1), /ownerProcessId -eq \$processId/);
  assert.match(saveCommand.at(-1), /spawned BioFigureStat window is not visible/);
  assert.match(saveCommand.at(-1), /FromBase64String/);
  assert.doesNotMatch(saveCommand.at(-1), /日本語|quote/);
  assert.match(saveCommand.at(-1), /AutomationIdProperty,\s*\n\s*'1001'/);
  assert.match(saveCommand.at(-1), /System\.Windows\.Forms/);
  assert.match(saveCommand.at(-1), /SendWait\('\{ENTER\}'\)/);

  const cancelCommand = windowsFileDialogCommand(4242, "cancel");
  assert.match(cancelCommand.at(-1), /AutomationIdProperty,\s*\n\s*'2'/);
  assert.throws(() => windowsFileDialogCommand(0, "cancel"), /positive integer/);
  assert.throws(() => windowsFileDialogCommand(4242, "save", "figure.svg"), /must be absolute/);
  assert.throws(() => windowsFileDialogCommand(4242, "overwrite"), /Unsupported/);
});

test("classifies Windows file-dialog failures from stderr rather than echoed command source", () => {
  const missing = windowsFileDialogFailure({
    stderr:
      "FILE_DIALOG_NOT_FOUND: native Save dialog did not appear; candidates=[]\r\n" +
      "command text HARNESS_FILE_DIALOG_AUTOMATION: not an actual failure",
  });
  assert.match(missing.message, /^FILE_DIALOG_NOT_FOUND:/);
  assert.equal(
    classifyNativeRegressionFailure(missing, [
      { name: "native_svg_save_dialog_cancel", status: "fail" },
    ]),
    "PRODUCT_REGRESSION",
  );

  const unavailable = windowsFileDialogFailure({
    stderr: "HARNESS_FILE_DIALOG_AUTOMATION: Windows UI Automation is unavailable\r\n",
  });
  assert.match(unavailable.message, /^HARNESS_FILE_DIALOG_AUTOMATION:/);
  assert.equal(
    classifyNativeRegressionFailure(unavailable, [
      { name: "native_svg_save_dialog_cancel", status: "fail" },
    ]),
    "HARNESS_INFRASTRUCTURE_BLOCKED",
  );

  const unsupportedControl = windowsFileDialogFailure({
    stderr: "GetCurrentPattern: unsupported pattern\r\n",
  });
  assert.match(unsupportedControl.message, /^HARNESS_FILE_DIALOG_AUTOMATION:/);
});

test("accepts the fresh WebView2 page target before its initial URL is committed", () => {
  const target = selectWebviewTarget([
    { type: "service_worker", url: "", webSocketDebuggerUrl: "ws://worker" },
    { type: "page", url: "", webSocketDebuggerUrl: "ws://fresh-page" },
  ]);
  assert.equal(target?.webSocketDebuggerUrl, "ws://fresh-page");
});

test("resolves the macOS executable from the application bundle metadata", async () => {
  assert.match(defaultNativeExecutable("macos"), /BioFigureStat\.app$/);
  assert.equal(
    macBundleExecutableFromPlist(`
      <plist><dict>
        <key>CFBundleExecutable</key>
        <string>lifescience-analysis-app</string>
      </dict></plist>
    `),
    "lifescience-analysis-app",
  );
  assert.match(
    await resolveNativeExecutable("macos", "/tmp/BioFigureStat.app/Contents/MacOS/custom-binary"),
    /custom-binary$/,
  );
  assert.throws(
    () => macBundleExecutableFromPlist("<plist><dict /></plist>"),
    /CFBundleExecutable/,
  );
});

test("builds a bounded macOS Accessibility typing action without interpolating user text as code", () => {
  const script = macAccessibilityScript("type", ["Experiment title"], 'quote " and 日本語');
  assert.match(script, /processes\.byName\("BioFigureStat"\)/);
  assert.match(script, /nodes\.length < 5000/);
  assert.match(script, /quote \\" and 日本語/);
  assert.match(script, /AXTextField/);
  assert.match(script, /matchingNodes\.find\(\(node\) => editableRoles\.has\(node\.role\)\)/);
  assert.match(script, /se\.click\(\{ at: typingPoint \}\)/);
  assert.match(script, /keystroke\("a", \{ using: "command down" \}\)/);
  assert.match(script, /keystroke\(replacement\)/);
});

test("audits visible text and accessibility attributes while allowing the language selector", () => {
  const expression = japaneseUiAuditExpression();
  assert.match(expression, /aria-label/);
  assert.match(expression, /placeholder/);
  assert.match(expression, /日本語/);
  assert.match(expression, /SHOW_TEXT/);
});

test("separates a missing WebView inspection channel from a product regression", () => {
  const steps = [
    {
      name: "native_webview_launch",
      status: "fail",
      detail: "Native WebView did not expose a CDP target",
    },
  ];
  assert.equal(
    classifyNativeRegressionFailure(
      new Error("Native WebView did not expose a CDP target on 127.0.0.1:50000"),
      steps,
    ),
    "HARNESS_INFRASTRUCTURE_BLOCKED",
  );
  assert.equal(
    classifyNativeRegressionFailure(
      new Error(
        "SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document.",
      ),
      [{ name: "isolated_english_session", status: "fail" }],
    ),
    "HARNESS_INFRASTRUCTURE_BLOCKED",
  );
  assert.equal(
    classifyNativeRegressionFailure(
      new Error("Native macOS application exited before BioFigureStat native window (code -2)"),
      [{ name: "macos_accessibility_attach", status: "fail" }],
    ),
    "HARNESS_INFRASTRUCTURE_BLOCKED",
  );
  assert.equal(
    classifyNativeRegressionFailure(
      new Error("HARNESS_EXECUTABLE_RESOLUTION: CFBundleExecutable is missing from Info.plist"),
      [],
    ),
    "HARNESS_INFRASTRUCTURE_BLOCKED",
  );
  assert.equal(
    classifyNativeRegressionFailure(
      new Error("HARNESS_FILE_DIALOG_AUTOMATION: Windows UI Automation is unavailable"),
      [{ name: "native_svg_save_dialog_cancel", status: "fail" }],
    ),
    "HARNESS_INFRASTRUCTURE_BLOCKED",
  );
  assert.equal(
    classifyNativeRegressionFailure(
      new Error("FILE_DIALOG_NOT_FOUND: native Save dialog did not appear"),
      [{ name: "native_svg_save_dialog_cancel", status: "fail" }],
    ),
    "PRODUCT_REGRESSION",
  );
  assert.equal(
    classifyNativeRegressionFailure(
      new Error("Native WebView did not expose a CDP target"),
      [{ name: "windows_lsa_command_line_open", status: "fail" }],
    ),
    "HARNESS_INFRASTRUCTURE_BLOCKED",
  );
  assert.equal(
    classifyNativeRegressionFailure(
      new Error("Timed out waiting for .lsa command-line open with editable data"),
      [{ name: "windows_lsa_command_line_open", status: "fail" }],
    ),
    "PRODUCT_REGRESSION",
  );
  assert.equal(
    classifyNativeRegressionFailure(
      new Error("typed experiment title was not exposed through macOS Accessibility: timeout"),
      [{ name: "macos_dirty_entry", status: "fail" }],
    ),
    "HARNESS_INFRASTRUCTURE_BLOCKED",
  );
  assert.equal(
    classifyNativeRegressionFailure(new Error("Cancel lost the dirty entry"), [
      { name: "native_close_requires_guard_and_cancel_retains_work", status: "fail" },
    ]),
    "PRODUCT_REGRESSION",
  );
});
