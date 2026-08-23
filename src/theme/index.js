import { createTheme, Table, Tabs } from "@mantine/core";

const brennanNavy = [
  "#EEF1F5",
  "#D7DCE3",
  "#AFB8C3",
  "#8793A2",
  "#5F6F82",
  "#374B63",
  "#0F2744",
  "#0C1F37",
  "#081526",
  "#040B14",
];

const ink = [
  "#FAFAFB",
  "#F4F5F6",
  "#EDEEF0",
  "#E5E7EA",
  "#D1D5D9",
  "#A4A9B0",
  "#7A8088",
  "#5A5F66",
  "#3B3F45",
  "#24272B",
];

export const theme = createTheme({
  primaryColor: "brennanNavy",
  primaryShade: { light: 6, dark: 6 },
  colors: {
    brennanNavy,
    gray: ink,
  },
  black: "#0E0F11",
  white: "#FFFFFF",

  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  fontFamilyMonospace: "'JetBrains Mono', ui-monospace, Menlo, monospace",
  headings: {
    fontFamily: "'Barlow Condensed', 'Oswald', sans-serif",
  },

  radius: {
    sm: "4px",
    md: "6px",
    lg: "10px",
  },
  defaultRadius: "md",

  shadows: {
    sm: "0 1px 2px rgba(15,17,21,.06), 0 0 0 1px rgba(15,17,21,.04)",
    md: "0 4px 12px rgba(15,17,21,.08), 0 0 0 1px rgba(15,17,21,.04)",
    lg: "0 18px 40px rgba(15,17,21,.16)",
  },

  components: {
    Table: Table.extend({
      styles: {
        thead: { backgroundColor: "#0F2744" },
        th: { color: "#fff", fontWeight: 700 },
      },
    }),
    Tabs: Tabs.extend({
      styles: {
        tabLabel: { fontWeight: 700 },
      },
    }),
  },
});
