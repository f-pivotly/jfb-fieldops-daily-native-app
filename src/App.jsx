import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Box, Loader } from "@mantine/core";
import AppHeader from "./components/AppHeader";
import LaunchPage from "./pages/LaunchPage";
import AdminApp from "./pages/Admin/AdminApp";
import DashboardPage from "./pages/FieldOps/DashboardPage";
import ReportListPage from "./pages/FieldOps/ReportListPage";
import ReportEditorPage from "./pages/FieldOps/ReportEditorPage";
import RealizedToDatePage from "./pages/FieldOps/RealizedToDatePage";
import WeeklySummaryPage from "./pages/FieldOps/WeeklySummaryPage";
import ProjectSettingsPage from "./pages/FieldOps/ProjectSettingsPage";
import OperatorHoursPage from "./pages/FieldOps/OperatorHoursPage";
import Forbidden from "./pages/Forbidden";
import NotFound from "./pages/NotFound";
import { useAppConfig } from "./contexts/appConfigContext";
import { fetchPageDetails } from "./data";

// The Admin page's own required_claims gate (apg-jfb-admin.view) — pe lacks
// it, pm/director/admin have it. Reused here so the launcher never offers a
// choice the backend would refuse anyway.
const ADMIN_PAGE_SLUG = "apg-jfb-admin";

export default function App() {
  const { config, ready } = useAppConfig();
  const [mode, setMode] = useState(null);
  // "checking" | "allowed" | "denied" — gates whether the launcher is shown at all.
  const [adminAccess, setAdminAccess] = useState("checking");

  useEffect(() => {
    if (!ready || !config.appSlug) return;
    let cancelled = false;

    fetchPageDetails(config.appSlug, ADMIN_PAGE_SLUG)
      .then(() => {
        if (!cancelled) setAdminAccess("allowed");
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        const errorCode = err?.response?.data?.error_code;
        if (status === 403 || errorCode === "PAGE_ACCESS_DENIED") {
          setAdminAccess("denied");
          setMode("fieldops");
        } else {
          // Fail-open: a transient/network error shouldn't lock the user out.
          setAdminAccess("allowed");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ready, config.appSlug]);

  if (!ready || adminAccess === "checking") {
    return (
      <Box
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Loader />
      </Box>
    );
  }

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
          <Route path="/admin/operators" element={<OperatorHoursPage />} />
          <Route path="/forbidden" element={<Forbidden />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Box>
    );
  }

  return null;
}
