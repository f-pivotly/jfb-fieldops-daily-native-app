import { useState } from "react";
import { Modal, Text, Textarea, Group, Button } from "@mantine/core";

export default function ReasonDialog({
  opened,
  onClose,
  title,
  description,
  label = "Reason",
  placeholder = "Explain why…",
  confirmLabel = "Confirm",
  confirmColor,
  onConfirm,
  submitting = false,
}) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 3;

  function handleClose() {
    if (submitting) return;
    setReason("");
    onClose();
  }

  async function handleConfirm() {
    if (!valid || submitting) return;
    await onConfirm(reason.trim());
    setReason("");
  }

  return (
    <Modal opened={opened} onClose={handleClose} title={<Text fw={700} size="sm">{title}</Text>} size="sm">
      {description && (
        <Text size="sm" mb={12}>
          {description}
        </Text>
      )}
      <Textarea
        label={label}
        placeholder={placeholder}
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
        minRows={3}
        mb={16}
        autoFocus
        disabled={submitting}
      />
      <Group justify="flex-end">
        <Button variant="default" size="xs" onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          size="xs"
          color={confirmColor}
          onClick={handleConfirm}
          disabled={!valid}
          loading={submitting}
          style={confirmColor ? undefined : { background: "#0F2744", border: "none" }}
        >
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
