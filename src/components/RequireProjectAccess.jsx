import { useParams, Navigate } from "react-router-dom";
import { Box, Loader } from "@mantine/core";
import { useVisibleProjects } from "../hooks/project/useVisibleProjects";

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
