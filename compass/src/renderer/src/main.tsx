import React from "react";
import { createRoot } from "react-dom/client";
import "streamdown/styles.css";
import App from "./App";
import "./styles/global.css";
import "./styles/sidebar.css";
import "./styles/composer.css";
import "./styles/thread.css";
import "./styles/panels.css";
import { applyInitialTheme } from "./theme";

applyInitialTheme();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
