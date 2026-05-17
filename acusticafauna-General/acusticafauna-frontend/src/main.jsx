import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const storedDarkMode = localStorage.getItem("acusticafauna_dark_mode");
const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches || false;
const initialDarkMode = storedDarkMode === null ? prefersDark : storedDarkMode === "true";
document.documentElement.classList.toggle("dark", initialDarkMode);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
