import { Box, Text, Group } from "@mantine/core";

export default function PageIdentityBar({ page }) {
  const identity = page?.identity || {};
  return (
    <Box
      px={24}
      pt={20}
      pb={14}
      style={{
        background: "#fff",
        borderBottom: "1px solid #ebebeb",
        flexShrink: 0,
      }}
    >
      <Group justify="space-between" align="flex-end">
        <Box>
          <Group gap={8} mb={4} align="center">
            <Text fw={800} size="lg" c="#111">
              {identity.name || page?.identity?.page_slug}
            </Text>
            <Box
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 3,
                background: "#f0fdf4",
                color: "#166534",
                border: "1px solid #bbf7d0",
                fontWeight: 600,
              }}
            >
              {page?.visible ? "● visible" : "○ hidden"}
            </Box>
          </Group>
          <Text size="xs" c="#aaa">
            {identity.description}
          </Text>
        </Box>
        <Box style={{ textAlign: "right" }}>
          <Text size="xs" c="#bbb" style={{ fontFamily: "monospace" }}>
            {identity.page_slug}
          </Text>
        </Box>
      </Group>
    </Box>
  );
}
