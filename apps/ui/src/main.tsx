import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { initializeNativeDiagnosticEnvironment } from "./app/diagnostics";
import "./styles.css";

void initializeNativeDiagnosticEnvironment();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
