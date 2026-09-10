import { useEffect, useState } from "react";
import { Box, Text, Stack, Group, Button } from "@mantine/core";
import { IconCheck, IconX, IconMinus } from "@tabler/icons-react";
import ReasonDialog from "../../../components/ReasonDialog";
import { useFieldOpsAction } from "../../../contexts/fieldOpsAccessContext";
import { useAppConfig } from "../../../contexts/appConfigContext";
import { buildPmReviewChecklist } from "../lib/reportPdfData";

const GLYPH = {
  pass: { Icon: IconCheck, color: "#1e7a3d" },
  fail: { Icon: IconX, color: "#d32129" },
  na: { Icon: IconMinus, color: "#6b7177" },
};

export default function PMReviewPanel({ project, report, equipment, onApprove, onSendBack, saving }) {
  const { config } = useAppConfig();
  const canReview = useFieldOpsAction("pm_review");
  const [checks, setChecks] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [lastAction, setLastAction] = useState(null);

  const shouldRun = canReview && report?.status === "cqc_review";

  useEffect(() => {
    if (!shouldRun || !project?.id || !report?.id) return;
    let cancelled = false;
    buildPmReviewChecklist({
      appSlug: config.appSlug,
      projectId: project.id,
      reportId: report.id,
      dateISO: report.report_date,
      equipment,
    })
      .then((result) => { if (!cancelled) setChecks(result); })
      .catch((err) => { if (!cancelled) setLoadError(err.message || "Failed to load validation checks."); });
    return () => { cancelled = true };
  }, [shouldRun, project?.id, report?.id, report?.report_date, equipment, config.appSlug]);

  if (!shouldRun) return null;

  const allPass = !!checks && checks.every((c) => c.status === "pass" || c.status === "na");

  async function handleApprove() {
    await onApprove();
    setLastAction({ type: "approved" });
  }

  async function handleSendBack(reason) {
    await onSendBack(reason);
    setLastAction({ type: "sent_back", reason });
    setSendBackOpen(false);
  }

  return (
    <Box pt={8} style={{ borderTop: "1px solid var(--mantine-color-gray-2)" }}>
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={6}>
        PM review
      </Text>

      {loadError && (
        <Text size="xs" c="red" mb={8}>
          {loadError}
        </Text>
      )}

      {checks === null && !loadError && (
        <Text size="xs" c="dimmed" mb={8}>
          Running validation checks…
        </Text>
      )}

      {checks !== null && (
        <Stack gap={4} mb={10}>
          {checks.map((c) => {
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
      )}

      <Stack gap={4}>
        <Button
          size="xs"
          color="green"
          loading={saving}
          onClick={handleApprove}
          disabled={saving || checks === null}
          title={!allPass && checks !== null ? "Validation checks have failures — approve anyway?" : undefined}
        >
          {checks !== null && !allPass ? "Approve anyway" : "Approve"}
        </Button>
        <Button size="xs" variant="default" disabled={saving} onClick={() => setSendBackOpen(true)}>
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
