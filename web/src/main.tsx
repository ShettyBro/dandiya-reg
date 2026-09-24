import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import "./index.css";

if (!location.pathname.startsWith("/vol/")) {
  document.querySelector('link[rel="manifest"]')?.remove();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      if (registration.scope === `${location.origin}/`) {
        registration.unregister();
      }
    }
  });
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// The app mounted without the ErrorBoundary's auto-reload-on-chunk-failure kicking in — clear its
// once-per-failure guard after a short stable period so a genuinely new failure later in this same
// tab session can still trigger one automatic recovery reload instead of being silently suppressed.
window.setTimeout(() => {
  try {
    sessionStorage.removeItem("dandiya-chunk-reload-attempted");
  } catch {
    // sessionStorage unavailable — nothing to clear.
  }
}, 5000);
