import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Box } from "@mantine/core";
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

export default function App() {
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
          <Route path="/admin/operators" element={<OperatorHoursPage />} />
          <Route path="/forbidden" element={<Forbidden />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Box>
    );
  }

  return null;
}
