import { useState } from "react";
import { Modal, Text, Textarea, Group, Button } from "@mantine/core";

export default function ReasonDialog({
  opened,
  onClose,
  title,
  label = "Reason",
  placeholder = "Explain why…",
  confirmLabel = "Confirm",
  confirmColor,
  onConfirm,
}) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 3;

  function handleClose() {
    setReason("");
    onClose();
  }

  function handleConfirm() {
    if (!valid) return;
    onConfirm(reason.trim());
    setReason("");
  }

  return (
    <Modal opened={opened} onClose={handleClose} title={<Text fw={700} size="sm">{title}</Text>} size="sm">
      <Textarea
        label={label}
        placeholder={placeholder}
        value={reason}
        onChange={(e) => setReason(e.currentTarget.value)}
        minRows={3}
        mb={16}
        autoFocus
      />
      <Group justify="flex-end">
        <Button variant="default" size="xs" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          size="xs"
          color={confirmColor}
          onClick={handleConfirm}
          disabled={!valid}
          style={confirmColor ? undefined : { background: "#0F2744", border: "none" }}
        >
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
