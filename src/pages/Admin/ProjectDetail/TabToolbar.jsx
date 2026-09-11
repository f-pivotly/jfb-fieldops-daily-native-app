import { Box, Text, Group, Button } from "@mantine/core";
import { IconPlus, IconRefresh } from "@tabler/icons-react";

export default function TabToolbar({ title, addLabel, onAdd, onReload, disabled, disabledHint }) {
  return (
    <Group justify="space-between" mb={12}>
      <Text fw={700} size="sm">{title}</Text>
      <Group gap={8}>
        <Box onClick={onReload} style={{ cursor: "pointer", color: "#aaa", display: "flex", alignItems: "center" }} title="Refresh">
          <IconRefresh size={14} />
        </Box>
        <Button
          size="xs"
          leftSection={<IconPlus size={12} />}
          onClick={onAdd}
          disabled={disabled}
          title={disabled ? disabledHint : undefined}
          style={{ background: "#0F2744", border: "none" }}
        >
          {addLabel}
        </Button>
      </Group>
    </Group>
  );
}
