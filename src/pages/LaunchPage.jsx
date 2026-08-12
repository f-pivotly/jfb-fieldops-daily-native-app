import { Box, Text, UnstyledButton } from "@mantine/core";
import { IconClipboardList, IconSettings } from "@tabler/icons-react";

export default function LaunchPage({ onSelect }) {
  return (
    <Box
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f6f8",
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      <Box
        style={{
          width: 480,
          background: "#fff",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        }}
      >
        <Box style={{ background: "#0F2744", color: "#fff", padding: "20px 24px" }}>
          <Text size="lg" fw={700} style={{ letterSpacing: ".2px" }}>
            Brennan Field Ops
          </Text>
          <Text size="sm" c="#e7ecf5" mt={2}>
            Daily Report System
          </Text>
        </Box>

        <Box p={24}>
          <Text size="xs" c="dimmed" mb={14}>
            Choose how you want to use this session
          </Text>

          <Box style={{ display: "flex", gap: 14 }}>
            <LaunchButton
              icon={<IconClipboardList size={26} />}
              label="Field Ops Daily"
              description="Reports, dashboards, crew & production tracking"
              onClick={() => onSelect("fieldops")}
            />
            <LaunchButton
              icon={<IconSettings size={26} />}
              label="Admin"
              description="Projects & back-office configuration"
              onClick={() => onSelect("admin")}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function LaunchButton({ icon, label, description, onClick }) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        flex: 1,
        padding: "20px 14px",
        background: "#f5f6f8",
        border: "1px solid #e7ecf5",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        color: "#111827",
        transition: "border-color .15s, background .15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#0F2744";
        e.currentTarget.style.background = "#eef2f8";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#e7ecf5";
        e.currentTarget.style.background = "#f5f6f8";
      }}
    >
      <Box style={{ color: "#0F2744" }}>{icon}</Box>
      <Text fw={700} size="sm" style={{ letterSpacing: ".2px" }}>
        {label}
      </Text>
      <Text size="xs" c="dimmed" ta="center">
        {description}
      </Text>
    </UnstyledButton>
  );
}
