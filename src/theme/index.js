import { createTheme } from "@mantine/core";

const brandRed = [
  "#FDEDEE", // 0
  "#FBDBDD", // 1
  "#F7B7BB", // 2
  "#F09499", // 3
  "#E86B72", // 4
  "#DE4249", // 5
  "#D32129", // 6 
  "#B81C23", // 7 
  "#A8181F", // 8 
  "#7A1015", // 9
];

const ink = [
  "#FAFAFB", // 0 — --gray-50
  "#F4F5F6", // 1 — --gray-100
  "#EDEEF0", // 2 — --gray-150
  "#E5E7EA", // 3 — --gray-200
  "#D1D5D9", // 4 — --gray-300
  "#A4A9B0", // 5 — --gray-400
  "#7A8088", // 6 — --gray-500
  "#5A5F66", // 7 — --gray-600
  "#3B3F45", // 8 — --gray-700
  "#24272B", // 9 — --gray-800
];

const status = {
  pass: { fg: "#1E7A3D", bg: "#E6F4EC", border: "#B7DDC4" },
  warn: { fg: "#B5740A", bg: "#FBF1DD", border: "#E6CB87" },
  fail: { fg: "#D32129", bg: "#FBE6E7", border: "#EDB8BB" },
  review: { fg: "#1F4FA3", bg: "#E5EDFA", border: "#B7C8E6" },
  na: { fg: "#6B7177", bg: "#EEF0F2", border: "#E5E7EA" },
};


export const theme = createTheme({
  primaryColor: "brandRed",
  primaryShade: { light: 6, dark: 6 },
  colors: {
    brandRed,
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

  other: {
    status,
  },
});
