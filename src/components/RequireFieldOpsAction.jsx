import { Navigate } from "react-router-dom";
import { useFieldOpsAction, useFieldOpsAccessLoading } from "../contexts/fieldOpsAccessContext";
import { Box, Loader } from "@mantine/core";

// Wraps a FieldOps route that needs a specific action's required_claim
// (resolved via the apg-jfb-fieldops page). Redirects to /forbidden if the
// current user doesn't have it, once resolved.
export default function RequireFieldOpsAction({ action, children }) {
  const enabled = useFieldOpsAction(action);
  const loading = useFieldOpsAccessLoading();

  if (loading) {
    return (
      <Box style={{ display: "flex", justifyContent: "center", padding: 40 }}>
        <Loader size="sm" />
      </Box>
    );
  }

  if (!enabled) {
    return <Navigate to="/forbidden" replace />;
  }

  return children;
}
