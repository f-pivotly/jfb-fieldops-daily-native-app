import { useState } from "react";
import { Box, Text, Stack, Group, Button } from "@mantine/core";
import { IconCheck, IconX, IconMinus } from "@tabler/icons-react";
import ReasonDialog from "../../../components/ReasonDialog";

const GLYPH = {
  pass: { Icon: IconCheck, color: "#1e7a3d" },
  fail: { Icon: IconX, color: "#d32129" },
  na: { Icon: IconMinus, color: "#6b7177" },
};

const PM_REVIEW_CHECKS_PLACEHOLDER = [
  { key: "event_log", label: "Event log present", status: "na" },
  { key: "shift_balance", label: "Shift balance per equipment", status: "na" },
  { key: "production", label: "Production stats entered", status: "na" },
  { key: "narratives", label: "Narratives complete", status: "na" },
  { key: "photos", label: "Photos uploaded, labeled, not rejected", status: "na" },
];

export default function PMReviewPanel() {
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [lastAction, setLastAction] = useState(null);

  const allPass = PM_REVIEW_CHECKS_PLACEHOLDER.every((c) => c.status !== "fail");

  function handleApprove() {
    setLastAction({ type: "approved" });
  }

  function handleSendBack(reason) {
    setLastAction({ type: "sent_back", reason });
    setSendBackOpen(false);
  }

  return (
    <Box pt={8} style={{ borderTop: "1px solid var(--mantine-color-gray-2)" }}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>
        PM review
      </Text>

      <Stack gap={4} mb={10}>
        {PM_REVIEW_CHECKS_PLACEHOLDER.map((c) => {
          const { Icon, color } = GLYPH[c.status] ?? GLYPH.na;
          return (
            <Box key={c.key}>
              <Group gap={6} wrap="nowrap">
                <Icon size={12} color={color} style={{ flexShrink: 0 }} />
                <Text size="xs">{c.label}</Text>
              </Group>
              {c.detail && (
                <Text size="10px" c="dimmed" ml={18}>
                  {c.detail}
                </Text>
              )}
            </Box>
          );
        })}
      </Stack>

      <Stack gap={4}>
        <Button size="xs" color="green" onClick={handleApprove} disabled={!allPass} title={!allPass ? "All checks must pass first" : undefined}>
          Approve
        </Button>
        <Button size="xs" variant="default" onClick={() => setSendBackOpen(true)}>
          Send back to PE
        </Button>
      </Stack>

      {lastAction?.type === "approved" && (
        <Text size="10px" c="#1e7a3d" fw={600} mt={8}>
          ✓ Approved
        </Text>
      )}
      {lastAction?.type === "sent_back" && (
        <Text size="10px" c="#b5740a" fw={600} mt={8}>
          Sent back — "{lastAction.reason}"
        </Text>
      )}

      <ReasonDialog
        opened={sendBackOpen}
        onClose={() => setSendBackOpen(false)}
        title="Send Back to PE"
        label="Reason for send back"
        placeholder="What needs to change before this can be approved?"
        confirmLabel="Send Back"
        onConfirm={handleSendBack}
      />
    </Box>
  );
}
