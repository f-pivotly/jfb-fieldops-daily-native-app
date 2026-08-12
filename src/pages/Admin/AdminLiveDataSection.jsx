import { useState } from "react";
import { Box, Text, Group, Select, TextInput, Table, Badge } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { SAMPLE_LIVE_EVENTS, SAMPLE_LIVE_PROJECTS, NON_OPERATIONAL_CATEGORIES } from "../../data/adminSampleData";

function formatTime12h(hhmm) {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function AdminLiveDataSection() {
  const [projectFilter, setProjectFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  const events = SAMPLE_LIVE_EVENTS.filter((e) => {
    if (!dateFilter) return false;
    if (e.report_date !== dateFilter) return false;
    if (projectFilter !== "all" && e.project !== projectFilter) return false;
    return true;
  });

  return (
    <Box>
      <Text fw={700} size="lg" mb={4}>Live Data</Text>
      <Text size="xs" c="dimmed" mb={16}>
        Read-only feed of operator daily events. Sample data for now — not wired to a real domain yet.
      </Text>

      <Group mb={16} align="flex-end">
        <Select
          label="Project"
          data={[{ value: "all", label: "All Projects" }, ...SAMPLE_LIVE_PROJECTS.map((p) => ({ value: p, label: p }))]}
          value={projectFilter}
          onChange={(v) => setProjectFilter(v ?? "all")}
          w={220}
        />
        <TextInput label="Date" type="date" value={dateFilter} onChange={(e) => setDateFilter(e.currentTarget.value)} w={160} />
        <Box onClick={() => setRefreshTick((n) => n + 1)} style={{ cursor: "pointer", color: "#888", display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }} title="Refresh">
          <IconRefresh size={14} /> <Text size="xs">Refresh</Text>
        </Box>
      </Group>

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, overflow: "hidden" }} key={refreshTick}>
        <Box p={16}>
          {!dateFilter && (
            <Text size="xs" c="dimmed" ta="center" py={24}>Select a date to load events</Text>
          )}
          {dateFilter && events.length === 0 && (
            <Text size="xs" c="dimmed" ta="center" py={24}>No events for this date</Text>
          )}
          {dateFilter && events.length > 0 && (
            <Box style={{ overflowX: "auto" }}>
              <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: 12, minWidth: 900 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Project</Table.Th>
                    <Table.Th>Equipment</Table.Th>
                    <Table.Th>Operator</Table.Th>
                    <Table.Th>From</Table.Th>
                    <Table.Th>To</Table.Th>
                    <Table.Th>Duration</Table.Th>
                    <Table.Th>Category</Table.Th>
                    <Table.Th>Area</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {events.map((e) => {
                    const isDowntime = NON_OPERATIONAL_CATEGORIES.includes(e.category);
                    const area = [e.area_l1, e.area_l2, e.area_l3].filter(Boolean).join(" · ") || "—";
                    return (
                      <Table.Tr key={e.id}>
                        <Table.Td>{e.project}</Table.Td>
                        <Table.Td>{e.equipment}</Table.Td>
                        <Table.Td>{e.operator_name}</Table.Td>
                        <Table.Td>{formatTime12h(e.time_from)}</Table.Td>
                        <Table.Td>{formatTime12h(e.time_to)}</Table.Td>
                        <Table.Td>{e.duration_hours.toFixed(2)} hrs</Table.Td>
                        <Table.Td><Badge size="xs" color={isDowntime ? "yellow" : "green"}>{e.category}</Badge></Table.Td>
                        <Table.Td>{area}</Table.Td>
                        <Table.Td><Badge size="xs" color="blue">{e.status || "draft"}</Badge></Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
