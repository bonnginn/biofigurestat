import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyNativeRegressionFailure,
  defaultNativeExecutable,
  japaneseUiAuditExpression,
  macAccessibilityScript,
  parseNativeRegressionArguments,
  selectWebviewTarget,
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
  assert.match(defaultNativeExecutable("windows"), /target[\\/]release[\\/]lifescience-analysis-app\.exe$/);
});

test("accepts the fresh WebView2 page target before its initial URL is committed", () => {
  const target = selectWebviewTarget([
    { type: "service_worker", url: "", webSocketDebuggerUrl: "ws://worker" },
    { type: "page", url: "", webSocketDebuggerUrl: "ws://fresh-page" },
  ]);
  assert.equal(target?.webSocketDebuggerUrl, "ws://fresh-page");
});

test("builds a bounded macOS Accessibility action without interpolating user text as code", () => {
  const script = macAccessibilityScript("set", ["Experiment title"], 'quote " and 日本語');
  assert.match(script, /processes\.byName\("BioFigureStat"\)/);
  assert.match(script, /nodes\.length < 5000/);
  assert.match(script, /quote \\" and 日本語/);
  assert.match(defaultNativeExecutable("macos"), /BioFigureStat\.app[\\/]Contents[\\/]MacOS[\\/]BioFigureStat$/);
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
    classifyNativeRegressionFailure(new Error("Cancel lost the dirty entry"), [
      { name: "native_close_requires_guard_and_cancel_retains_work", status: "fail" },
    ]),
    "PRODUCT_REGRESSION",
  );
});
