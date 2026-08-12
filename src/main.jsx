import ReactDOM from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import "@mantine/core/styles.css";
import "./theme/fonts.css";
import { theme } from "./theme";
import App from "./App";
import { PivotlyAppConfigProvider } from "./contexts/PivotlyAppConfigContext";

const router = createMemoryRouter([{ path: "*", element: <App /> }]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <MantineProvider theme={theme} defaultColorScheme="light">
    <PivotlyAppConfigProvider>
      <RouterProvider router={router} />
    </PivotlyAppConfigProvider>
  </MantineProvider>,
);
