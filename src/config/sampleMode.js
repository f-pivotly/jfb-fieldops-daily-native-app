// Temporary bypass: renders DashboardPage directly with static sample data
// instead of waiting on a real Pivotly parent handshake + backend nav/app_page
// registration (neither exists yet — see JFB_FIELDOPS_DAILY_SCREENS_AND_PAGE_SLUGS.md
// for the planned apg-jfbo-* slugs). Flip to false once apg-jfbo-dashboard is
// registered server-side — everything else (App.jsx, PivotlyAppConfigContext,
// hooks) is untouched either way. Mirrors the same pattern already used in
// jfb-dot-to-dot-native-app/src/config/sampleMode.js.
export const SAMPLE_MODE = true;
