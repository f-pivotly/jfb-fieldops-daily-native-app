import { useState } from "react";
import { useLocation, Routes, Route } from "react-router-dom";
import { Box, Text, Loader, Center } from "@mantine/core";
import AppHeader from "./components/AppHeader";
import LaunchPage from "./pages/LaunchPage";
import AdminApp from "./pages/Admin/AdminApp";
import PageContent from "./pages/FieldOps/ContentRouter";
import DashboardPage from "./pages/FieldOps/DashboardPage";
import ReportListPage from "./pages/FieldOps/ReportListPage";
import ReportEditorPage from "./pages/FieldOps/ReportEditorPage";
import RealizedToDatePage from "./pages/FieldOps/RealizedToDatePage";
import WeeklySummaryPage from "./pages/FieldOps/WeeklySummaryPage";
import ProjectSettingsPage from "./pages/FieldOps/ProjectSettingsPage";
import Forbidden from "./pages/Forbidden";
import NotFound from "./pages/NotFound";

import { useNav } from "./hooks/useNav";
import { usePageDetails } from "./hooks/usePageDetails";
import { useAppConfig } from "./contexts/appConfigContext";
import { usePicklistCatalog } from "./hooks/usePicklistCatalog";
import { REQUIRED_PICKLISTS } from "./config/requiredPicklists";

export default function App() {
  const { pathname } = useLocation();
  const { ready, error: configError } = useAppConfig();
  const { loading: picklistsLoading, missing: missingPicklists } = usePicklistCatalog(REQUIRED_PICKLISTS);

  const { menuItems, defaultItem } = useNav();
  const {
    pageData,
    loading: pageLoading,
    error: pageError,
    slug,
    loadPage,
  } = usePageDetails();

  const [mode, setMode] = useState(null);

  if (!mode) {
    return <LaunchPage onSelect={setMode} />;
  }

  if (mode === "admin") {
    return <AdminApp onExit={() => setMode(null)} />;
  }

  if (mode === "fieldops") {
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
        <AppHeader />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects/:projectId/reports" element={<ReportListPage />} />
          <Route path="/projects/:projectId/reports/:date" element={<ReportEditorPage />} />
          <Route path="/projects/:projectId/realized" element={<RealizedToDatePage />} />
          <Route path="/projects/:projectId/weekly" element={<WeeklySummaryPage />} />
          <Route path="/projects/:projectId/settings" element={<ProjectSettingsPage />} />
          <Route path="/forbidden" element={<Forbidden />} />
          <Route path="*" element={<NotFound />} />
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
          background: "#0F2744",
        }}
      >
        <Loader color="brennanNavy" size="sm" />
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
          background: "#0F2744",
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
          background: "#0F2744",
        }}
      >
        <Loader color="brennanNavy" size="sm" />
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
          background: "#0F2744",
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
      <AppHeader />

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
