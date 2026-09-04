import { useParams, Navigate } from "react-router-dom";
import { Box, Loader } from "@mantine/core";
import { useVisibleProjects } from "../hooks/useVisibleProjects";

// Wraps a /projects/:projectId/* route that has no membership check of its
// own (mirrors a gap found in the reference Supabase app's Realized-to-Date
// and Weekly Summary pages). Cross-project roles (director/admin) pass
// through unconditionally; pe/pm only pass if :projectId is in their
// jfb_project_members list.
export default function RequireProjectAccess({ children }) {
  const { projectId } = useParams();
  const { projects, loading, isCrossProject } = useVisibleProjects();

  if (loading) {
    return (
      <Box style={{ display: "flex", justifyContent: "center", padding: 40 }}>
        <Loader size="sm" />
      </Box>
    );
  }

  const hasAccess = isCrossProject || projects.some((p) => p.id === projectId);
  if (!hasAccess) {
    return <Navigate to="/forbidden" replace />;
  }

  return children;
}
