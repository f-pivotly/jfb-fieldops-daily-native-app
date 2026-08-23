import { Box, Text, SimpleGrid, Table } from "@mantine/core";
import { useDomainData } from "../../hooks/useDomainData";
import LoadingSpinner from "../../components/LoadingSpinner";
import SafeError from "../../components/SafeError";

export default function AdminDashboardSection() {
  const { records, loading, error } = useDomainData({ domain: "jfb_projects", system: "core" });
  const activeProjects = records.filter((r) => r.is_active);

  return (
    <Box>
      <Text fw={700} size="lg" mb={16}>
        Dashboard
      </Text>

      <SimpleGrid cols={{ base: 2, sm: 4 }} mb={20}>
        <Kpi label="Active Projects" value={loading ? "…" : activeProjects.length} />
        <Kpi label="Total Operators" value="—" />
        <Kpi label="Equipment Units" value="—" />
        <Kpi label="Events Today" value="—" />
      </SimpleGrid>

      <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, overflow: "hidden" }}>
        <Box px={16} py={10} style={{ background: "#f9f9f9", borderBottom: "1px solid #ebebeb" }}>
          <Text fw={700} size="xs" style={{ letterSpacing: "1px", textTransform: "uppercase", color: "#888" }}>
            Active Projects
          </Text>
        </Box>
        <Box p={16}>
          {loading && <LoadingSpinner py={24} />}
          {!loading && <SafeError message={error} />}
          {!loading && !error && activeProjects.length === 0 && (
            <Text size="xs" c="#aaa" ta="center" py={24}>
              No active projects
            </Text>
          )}
          {!loading && !error && activeProjects.length > 0 && (
            <Box style={{ overflowX: "auto" }}>
              <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: 12, minWidth: 600 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Project</Table.Th>
                    <Table.Th>Client</Table.Th>
                    <Table.Th>Work Type</Table.Th>
                    <Table.Th>Volume Goal</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {activeProjects.map((row) => (
                    <Table.Tr key={row.id}>
                      <Table.Td style={{ fontWeight: 600 }}>{row.name}</Table.Td>
                      <Table.Td>{row.client_name ?? "—"}</Table.Td>
                      <Table.Td>{row.work_type ?? "—"}</Table.Td>
                      <Table.Td>
                        {row.volume_goal ? `${Number(row.volume_goal).toLocaleString()} ${row.primary_measure ?? "CY"}` : "—"}
                      </Table.Td>
                      <Table.Td>{row.is_active ? "Active" : "Inactive"}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function Kpi({ label, value }) {
  return (
    <Box style={{ background: "#fff", border: "1px solid #ebebeb", borderRadius: 6, padding: "14px 16px" }}>
      <Text size="10px" c="dimmed" style={{ textTransform: "uppercase", letterSpacing: ".5px" }}>
        {label}
      </Text>
      <Text size="xl" fw={700}>
        {value}
      </Text>
    </Box>
  );
}
