import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import "@mantine/core/styles.css";
import "./theme/fonts.css";
import { theme } from "./theme";
import App from "./App";
import { PivotlyAppConfigProvider } from "./contexts/PivotlyAppConfigContext";
import { setTruncationListener } from "./data";

const truncations = [];
setTruncationListener((detail) => {
  truncations.push({ ...detail, at: new Date().toISOString() });
  console.error(detail.message, detail);
});
window.__pivotlyTruncations = truncations;

const router = createMemoryRouter([{ path: "*", element: <App /> }]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PivotlyAppConfigProvider>
      <RouterProvider router={router} />
    </PivotlyAppConfigProvider>
  </MantineProvider>,
);
