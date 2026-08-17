import { useNavigate } from "react-router-dom";
import { Box, Text, Button } from "@mantine/core";
import { IconMapPinOff } from "@tabler/icons-react";

export default function NotFound() {
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
      <IconMapPinOff size={32} color="#0F2744" />
      <Text fw={700} size="lg">
        404 — Page not found
      </Text>
      <Text size="sm" c="dimmed" ta="center" maw={360}>
        That page does not exist.
      </Text>
      <Button size="xs" mt={10} onClick={() => navigate("/")} style={{ background: "#0F2744", border: "none" }}>
        Back home
      </Button>
    </Box>
  );
}
