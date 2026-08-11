import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import "@mantine/core/styles.css";
import "./theme/fonts.css";
import { theme } from "./theme";
import App from "./App";
import { PivotlyAppConfigProvider } from "./contexts/PivotlyAppConfigContext";

// ── Router ────────────────────────────────────────────────────────────────────
const router = createMemoryRouter([{ path: "*", element: <App /> }]);

// ── Mount ─────────────────────────────────────────────────────────────────────
ReactDOM.createRoot(document.getElementById("root")).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PivotlyAppConfigProvider>
      <RouterProvider router={router} />
    </PivotlyAppConfigProvider>
  </MantineProvider>,
);
