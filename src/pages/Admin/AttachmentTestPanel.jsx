import { useRef, useState } from "react";
import { Box, Text, Group, Button, TextInput, Table, Badge } from "@mantine/core";
import { IconPlus, IconRefresh, IconUpload, IconDownload, IconTrash } from "@tabler/icons-react";
import SafeError from "../../components/SafeError";
import { useAppConfig } from "../../contexts/appConfigContext";
import {
  createDomainRecord,
  uploadAttachment,
  getAttachments,
  downloadAttachment,
  deleteAttachment,
  readWrittenRecordId,
} from "../../data";

// Default points at the throwaway domain created for this test panel.
// This must be the config item's SLUG (core.cfg_items_b.slug), not the
// domain_table_name -- core.fnc_crd_ctx_from_inputs looks up
// core.cfg_domain_info_cache_b by slug, and that cache row only exists
// after the domain has been Published (Save alone doesn't populate it).
// Same rule PhotosTab.jsx / DredgeProgressTab.jsx rely on for their domains.
const DEFAULT_TEST_DOMAIN = "test_attachment_demos";

function fmtSize(n) {
  if (n === null || n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AttachmentTestPanel() {
  const { config } = useAppConfig();
  const fileInputRef = useRef(null);

  const [domain, setDomain] = useState(DEFAULT_TEST_DOMAIN);
  const [records, setRecords] = useState([]);
  const [activeRecordId, setActiveRecordId] = useState(null);
  const [attachments, setAttachments] = useState([]);

  const [creatingRecord, setCreatingRecord] = useState(false);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyFileId, setBusyFileId] = useState(null);
  const [error, setError] = useState(null);

  const activeRecord = records.find((r) => r.id === activeRecordId) ?? null;

  async function refreshAttachments(recordId) {
    if (!recordId) return;
    setLoadingAttachments(true);
    setError(null);
    try {
      const rows = await getAttachments({ coreRecordId: recordId, domain });
      setAttachments(rows);
    } catch (e) {
      setError(e?.message || "Could not load attachments.");
    } finally {
      setLoadingAttachments(false);
    }
  }

  async function handleCreateRecord() {
    setCreatingRecord(true);
    setError(null);
    try {
      const stamp = new Date().toLocaleString();
      const res = await createDomainRecord({
        domain,
        system: "core",
        appSlug: config.appSlug,
        recordData: {
          name: `Attachment test record — ${stamp}`,
          description: "Created by the Users > Attachment Test panel",
          status: "draft",
        },
      });
      const recordId = readWrittenRecordId(res);
      if (!recordId) throw new Error("Domain did not return a record id — is it published yet?");
      setRecords((prev) => [{ id: recordId, label: stamp }, ...prev]);
      setActiveRecordId(recordId);
      setAttachments([]);
    } catch (e) {
      setError(e?.message || "Could not create a test record. Make sure the domain is published.");
    } finally {
      setCreatingRecord(false);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file || !activeRecordId) return;
    setUploading(true);
    setError(null);
    try {
      await uploadAttachment({ coreRecordId: activeRecordId, domain, file });
      await refreshAttachments(activeRecordId);
    } catch (e2) {
      setError(e2?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(row) {
    setBusyFileId(row.fileId);
    setError(null);
    try {
      const blob = await downloadAttachment(row.fileId);
      triggerDownload(blob, row.logicalName || "attachment");
    } catch (e) {
      setError(e?.message || "Download failed.");
    } finally {
      setBusyFileId(null);
    }
  }

  async function handleDelete(row) {
    setBusyFileId(row.fileId);
    setError(null);
    try {
      await deleteAttachment({ fileId: row.fileId, domain, coreRecordId: activeRecordId });
      await refreshAttachments(activeRecordId);
    } catch (e) {
      setError(e?.message || "Delete failed.");
    } finally {
      setBusyFileId(null);
    }
  }

  function selectRecord(id) {
    setActiveRecordId(id);
    refreshAttachments(id);
  }

  return (
    <Box>
      <Group justify="space-between" mb={12} align="flex-end">
        <Box>
          <Text fw={700} size="sm">Attachment Test</Text>
          <Text size="xs" c="dimmed">
            Exercises the Pivotly attachment API (upload / list / download / delete) against a test domain.
          </Text>
        </Box>
        <TextInput
          label="Domain slug"
          size="xs"
          value={domain}
          onChange={(e) => setDomain(e.currentTarget.value.trim())}
          style={{ width: 220 }}
        />
      </Group>

      <SafeError message={error} />

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 12, marginBottom: 12 }}>
        <Group justify="space-between" mb={8}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">Test records ({domain})</Text>
          <Button
            size="xs"
            leftSection={<IconPlus size={12} />}
            loading={creatingRecord}
            onClick={handleCreateRecord}
            style={{ background: "#0F2744", border: "none" }}
          >
            New Test Record
          </Button>
        </Group>

        {records.length === 0 ? (
          <Text size="xs" c="dimmed" ta="center" py={16}>
            No test records yet — create one, then upload a file to it below.
          </Text>
        ) : (
          <Group gap={8}>
            {records.map((r) => (
              <Badge
                key={r.id}
                size="lg"
                variant={r.id === activeRecordId ? "filled" : "outline"}
                color={r.id === activeRecordId ? "dark" : "gray"}
                style={{ cursor: "pointer", textTransform: "none" }}
                onClick={() => selectRecord(r.id)}
              >
                {r.label}
              </Badge>
            ))}
          </Group>
        )}
      </Box>

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: 12 }}>
        <Group justify="space-between" mb={8}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
            Attachments{activeRecord ? ` — ${activeRecord.label}` : ""}
          </Text>
          <Group gap={8}>
            <Box
              onClick={() => activeRecordId && refreshAttachments(activeRecordId)}
              style={{ cursor: activeRecordId ? "pointer" : "default", color: "#aaa", display: "flex", alignItems: "center" }}
              title="Refresh"
            >
              <IconRefresh size={14} />
            </Box>
            <Button
              size="xs"
              leftSection={<IconUpload size={12} />}
              disabled={!activeRecordId}
              loading={uploading}
              onClick={() => fileInputRef.current?.click()}
              style={{ background: "#0F2744", border: "none" }}
            >
              Upload File
            </Button>
            <input ref={fileInputRef} type="file" onChange={handleUpload} style={{ display: "none" }} />
          </Group>
        </Group>

        {!activeRecordId && (
          <Text size="xs" c="dimmed" ta="center" py={16}>Select or create a test record above first.</Text>
        )}

        {activeRecordId && loadingAttachments && (
          <Text size="xs" c="dimmed" ta="center" py={16}>Loading…</Text>
        )}

        {activeRecordId && !loadingAttachments && attachments.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" py={16}>No attachments uploaded to this record yet.</Text>
        )}

        {activeRecordId && !loadingAttachments && attachments.length > 0 && (
          <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: 12 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>File</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Size</Table.Th>
                <Table.Th>Uploaded</Table.Th>
                <Table.Th style={{ width: 90 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {attachments.map((row) => (
                <Table.Tr key={row.fileId}>
                  <Table.Td style={{ fontWeight: 600 }}>{row.logicalName}</Table.Td>
                  <Table.Td>{row.mimeType || "—"}</Table.Td>
                  <Table.Td>{fmtSize(row.size)}</Table.Td>
                  <Table.Td>{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <Box
                        onClick={() => busyFileId !== row.fileId && handleDownload(row)}
                        style={{ cursor: "pointer", color: "#0F2744" }}
                        title="Download"
                      >
                        <IconDownload size={14} />
                      </Box>
                      <Box
                        onClick={() => busyFileId !== row.fileId && handleDelete(row)}
                        style={{ cursor: "pointer", color: "#d32129" }}
                        title="Delete"
                      >
                        <IconTrash size={14} />
                      </Box>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Box>
    </Box>
  );
}
