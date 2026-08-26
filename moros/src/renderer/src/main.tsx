import React from "react";
import { createRoot } from "react-dom/client";
import "streamdown/styles.css";
import App from "./App";
import "./styles/Global/index.css";
import "./styles/Sidebar/index.css";
import "./styles/Composer/index.css";
import "./styles/Thread/index.css";
import "./styles/Panels/index.css";
import { applyInitialCodeFont } from "./code-font";
import { applyInitialTheme } from "./theme";

applyInitialTheme();
applyInitialCodeFont();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
