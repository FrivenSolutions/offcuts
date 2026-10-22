import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { App } from "./App";
import { AuthProvider } from "./lib/auth";
import "./styles.css";

// The list page restores its own scroll position after its data loads.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

// A data router lets the editor block in-app navigation when there are unsaved changes.
const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <AuthProvider>
        <App />
      </AuthProvider>
    ),
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
