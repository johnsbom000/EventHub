import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// adjust this import path if your context file is in a different folder
import { LocationProvider } from "./context/LocationContext";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

const root = createRoot(rootElement);

root.render(
  <React.StrictMode>
    <LocationProvider>
      <App />
    </LocationProvider>
  </React.StrictMode>
);
