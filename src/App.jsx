import { useNavigate, useLocation, Routes, Route } from "react-router-dom";
import { Box, Text, Loader, Center } from "@mantine/core";
import AppHeader from "./components/AppHeader";
import PageContent from "./pages/PageContent";
import DashboardPage from "./pages/PageContent/DashboardPage";
import ReportListPage from "./pages/PageContent/ReportListPage";
import ReportEditorPage from "./pages/PageContent/ReportEditorPage";
import RealizedToDatePage from "./pages/PageContent/RealizedToDatePage";
import WeeklySummaryPage from "./pages/PageContent/WeeklySummaryPage";
import ProjectSettingsPage from "./pages/PageContent/ProjectSettingsPage";
import OperatorHoursPage from "./pages/PageContent/OperatorHoursPage";
import CappingSetupPage from "./pages/PageContent/CappingSetupPage";

import { useNav } from "./hooks/useNav";
import { usePageDetails } from "./hooks/usePageDetails";
import { useAppConfig } from "./contexts/appConfigContext";
import { usePicklistCatalog } from "./hooks/usePicklistCatalog";
import { REQUIRED_PICKLISTS } from "./config/requiredPicklists";
import { SAMPLE_MODE } from "./config/sampleMode";

// Mirrors the draft app.pages[] composition in
// JFB_FIELDOPS_DAILY_SCREENS_AND_PAGE_SLUGS.md §5 — only the show_in_menu:
// true entries appear in the top nav; the rest are reached by drilling in
// (Dashboard → Report List → Report Editor, etc.), same as the real app.
const SAMPLE_MENU_ITEMS = [
  { page_slug: "apg-jfbo-dashboard", label: "Dashboard", path: "/" },
  { page_slug: "apg-jfbo-operator-hours", label: "Operator Hours", path: "/admin/operators" },
  { page_slug: "apg-jfbo-capping-setup", label: "Capping Setup", path: "/admin/capping-setup" },
];

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { ready, error: configError } = useAppConfig();
  const { loading: picklistsLoading, missing: missingPicklists } = usePicklistCatalog(REQUIRED_PICKLISTS);

  const { menuItems, defaultItem, loading: navLoading } = useNav();
  const {
    pageData,
    loading: pageLoading,
    error: pageError,
    slug,
    loadPage,
  } = usePageDetails();

  // Sample-mode bypass: renders every planned screen from static data instead
  // of waiting on a real Pivotly parent handshake + backend app_page
  // registration (none of the apg-jfbo-* slugs are created yet — see
  // JFB_FIELDOPS_DAILY_SCREENS_AND_PAGE_SLUGS.md). See src/config/sampleMode.js.
  // All the hooks above still get called normally (rules-of-hooks) — they just
  // never fire real network requests since `ready`/`config.appSlug` never
  // resolve without a real parent.
  //
  // Routing note: real apg-jfbo-* pages will be registered as top-level Portal
  // routes, not nested React Router routes — this <Routes> block is a
  // sample-mode-only convenience so the sample screens can link to each other
  // with real paths/useNavigate today. It goes away (along with SAMPLE_MODE)
  // once each page reads from a real resolve() call instead.
  if (SAMPLE_MODE) {
    const resolvedSlug = SAMPLE_MENU_ITEMS.find((n) => n.path === pathname)?.page_slug ?? null;
    return (
      <Box
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          fontFamily: "'Inter', -apple-system, sans-serif",
          fontSize: 13,
        }}
      >
        <AppHeader
          menuItems={SAMPLE_MENU_ITEMS}
          activeSlug={resolvedSlug}
          onNav={(navItem) => navigate(navItem.path)}
          navLoading={false}
        />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects/:projectId/reports" element={<ReportListPage />} />
          <Route path="/projects/:projectId/reports/:date" element={<ReportEditorPage />} />
          <Route path="/projects/:projectId/realized" element={<RealizedToDatePage />} />
          <Route path="/projects/:projectId/weekly" element={<WeeklySummaryPage />} />
          <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
          <Route path="/admin/operators" element={<OperatorHoursPage />} />
          <Route path="/admin/capping-setup" element={<CappingSetupPage />} />
        </Routes>
      </Box>
    );
  }

  if (!ready && !configError) {
    return (
      <Center
        style={{
          height: "100vh",
          flexDirection: "column",
          gap: 12,
          background: "#141414",
        }}
      >
        <Loader color="red" size="sm" />
        <Text size="xs" c="#666">
          Waiting for configuration…
        </Text>
      </Center>
    );
  }

  if (configError) {
    return (
      <Center
        style={{
          height: "100vh",
          flexDirection: "column",
          gap: 8,
          background: "#141414",
        }}
      >
        <Text size="xs" c="#ef4444" fw={600}>
          Configuration error
        </Text>
        <Text size="xs" c="#666">
          {configError}
        </Text>
      </Center>
    );
  }

  if (picklistsLoading) {
    return (
      <Center
        style={{
          height: "100vh",
          flexDirection: "column",
          gap: 12,
          background: "#141414",
        }}
      >
        <Loader color="red" size="sm" />
        <Text size="xs" c="#666">
          Loading picklist catalog…
        </Text>
      </Center>
    );
  }

  if (missingPicklists.length > 0) {
    return (
      <Center
        style={{
          height: "100vh",
          flexDirection: "column",
          gap: 8,
          background: "#141414",
        }}
      >
        <Text size="xs" c="#ef4444" fw={600}>
          Configuration error — missing required picklists
        </Text>
        <Text size="xs" c="#666" ta="center" maw={420}>
          {missingPicklists.join(", ")}
        </Text>
      </Center>
    );
  }

  const activeItem =
    menuItems.find((n) => n.path === pathname) ?? defaultItem ?? null;

  const resolvedSlug = activeItem?.page_slug ?? null;

  function handleNav(navItem) {
    navigate(navItem.path);
    loadPage(navItem.page_slug);
  }

  function handleRetry() {
    if (resolvedSlug) loadPage(resolvedSlug);
  }

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        fontFamily: "'Inter', -apple-system, sans-serif",
        fontSize: 13,
      }}
    >
      <AppHeader
        menuItems={menuItems}
        activeSlug={resolvedSlug}
        onNav={handleNav}
        navLoading={navLoading}
      />

      {activeItem ? (
        <PageContent
          pageData={pageData}
          loading={pageLoading}
          error={pageError}
          slug={slug}
          onRetry={handleRetry}
        />
      ) : (
        <Box
          style={{
            height: "80vh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: 24,
            fontWeight: "bold",
            opacity: 0.7,
          }}
        >
          Select navigation item above
        </Box>
      )}
    </Box>
  );
}
