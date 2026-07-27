/// <reference types="vite/client" />

import "@fontsource/press-start-2p/400.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "./shell/cabinet/cabinet-tokens.css";
import "./shell/cabinet/crt.css";
import "./shell/cabinet/util.css";
import "./shell/theme.css";
import { createRoot } from "react-dom/client";
import { App } from "./shell/App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
