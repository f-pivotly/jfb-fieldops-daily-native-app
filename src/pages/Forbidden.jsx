import { useNavigate } from "react-router-dom";
import { Box, Text, Button } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";

export default function Forbidden() {
  const navigate = useNavigate();
  return (
    <Box
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        background: "#f5f6f8",
      }}
    >
      <IconLock size={32} color="#0F2744" />
      <Text fw={700} size="lg">
        403 — Access denied
      </Text>
      <Text size="sm" c="dimmed" ta="center" maw={360}>
        Your role does not have permission to view that screen.
      </Text>
      <Button size="xs" mt={10} onClick={() => navigate("/")} style={{ background: "#0F2744", border: "none" }}>
        Back to Dashboard
      </Button>
    </Box>
  );
}
