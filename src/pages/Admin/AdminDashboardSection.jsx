import { useEffect, useState } from "react";
import { Box, Text, SimpleGrid, Table } from "@mantine/core";
import { useDomainData } from "../../hooks/core/useDomainData";
import { useAppConfig } from "../../contexts/appConfigContext";
import { fetchDomainRecords } from "../../data";
import LoadingSpinner from "../../components/LoadingSpinner";
import SafeError from "../../components/SafeError";

const NAVY = "#0F2744";
const BLUE = "#1A5CA8";
const BORDER = "#D1DCE8";
const MUTED = "#5A7088";

async function countRecords(appSlug, domain, filters) {
  const res = await fetchDomainRecords({ domain, system: "core", appSlug, filters, limit: 1, countMode: "exact", forceMeta: true });
  return res?.meta?.total_records ?? null;
}

async function countActiveOperators(appSlug) {
  const res = await fetchDomainRecords({ domain: "jfb_project_operators", system: "core", appSlug, limit: 1000 });
  const rows = res?.data ?? [];
  return new Set(rows.filter((r) => r.is_active !== false).map((r) => r.operator_id)).size;
}

function todayUtcRange() {
  const start = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start.toISOString(), lt: end.toISOString() };
}

function useDashboardCounts(appSlug) {
  const [counts, setCounts] = useState({ operators: null, equipment: null, events: null });

  useEffect(() => {
    if (!appSlug) return;
    let cancelled = false;
    const settle = (key) => (value) => { if (!cancelled) setCounts((c) => ({ ...c, [key]: value })); };
    const fail = (key) => () => { if (!cancelled) setCounts((c) => ({ ...c, [key]: null })); };

    countActiveOperators(appSlug).then(settle("operators")).catch(fail("operators"));
    countRecords(appSlug, "jfb_equipments", { is_active: true }).then(settle("equipment")).catch(fail("equipment"));
    countRecords(appSlug, "jfb_daily_activities", { start_date_time: todayUtcRange() }).then(settle("events")).catch(fail("events"));

    return () => { cancelled = true; };
  }, [appSlug]);

  return counts;
}

export default function AdminDashboardSection() {
  const { config } = useAppConfig();
  const { records, loading, error } = useDomainData({ domain: "jfb_projects", system: "core" });
  const { records: areaLevels } = useDomainData({ domain: "jfb_project_area_levels", system: "core" });
  const counts = useDashboardCounts(config.appSlug);
  const activeProjects = records.filter((r) => r.is_active);

  const levelPathByProject = {};
  for (const level of areaLevels.slice().sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))) {
    if (!level.label) continue;
    (levelPathByProject[level.project_id] ??= []).push(level.label);
  }

  return (
    <Box>
      <Text fw={700} size="lg" mb={16}>
        Dashboard
      </Text>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing={14} mb={20}>
        <Kpi label="Active Projects" value={loading ? "—" : activeProjects.length} />
        <Kpi label="Total Operators" value={counts.operators} />
        <Kpi label="Equipment Units" value={counts.equipment} />
        <Kpi label="Events Today" value={counts.events} />
      </SimpleGrid>

      <Box style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 18 }}>
        <Text size="13px" fw={700} c={NAVY} mb={14}>
          Active Projects
        </Text>
        {loading && <LoadingSpinner py={24} />}
        {!loading && <SafeError message={error} />}
        {!loading && !error && activeProjects.length === 0 && (
          <Box ta="center" py={40} px={20}>
            <Text size="32px" mb={10}>🗂</Text>
            <Text size="13px" c={MUTED}>No active projects</Text>
          </Box>
        )}
        {!loading && !error && activeProjects.length > 0 && (
          <Box style={{ overflowX: "auto" }}>
            <Table
              striped
              highlightOnHover
              stripedColor="#F8FAFC"
              highlightOnHoverColor="#EBF3FB"
              borderColor="#EBF0F7"
              horizontalSpacing={14}
              verticalSpacing={10}
              style={{ fontSize: 12, minWidth: 760 }}
              styles={{ th: { fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.75)", letterSpacing: "0.04em", padding: "9px 14px" }, td: { color: NAVY } }}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Project</Table.Th>
                  <Table.Th>Client</Table.Th>
                  <Table.Th>Work Type</Table.Th>
                  <Table.Th>Volume Goal</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Equipment</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {activeProjects.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td style={{ fontWeight: 700 }}>{row.name}</Table.Td>
                    <Table.Td>{row.client_name || "—"}</Table.Td>
                    <Table.Td>{row.work_type || "—"}</Table.Td>
                    <Table.Td>
                      {row.volume_goal ? `${Number(row.volume_goal).toLocaleString()} ${row.primary_measure || "CY"}` : "—"}
                    </Table.Td>
                    <Table.Td>
                      <Text span size="10px" fw={700} style={{ background: "#D4EDDA", color: "#1B6B3A", padding: "2px 8px", borderRadius: 20 }}>
                        Active
                      </Text>
                    </Table.Td>
                    <Table.Td>{(levelPathByProject[row.id] ?? []).join(" → ")}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Kpi({ label, value }) {
  return (
    <Box style={{ background: "#fff", border: `1px solid ${BORDER}`, borderTop: `3px solid ${BLUE}`, borderRadius: 10, padding: 16 }}>
      <Text size="10px" fw={700} c={MUTED} mb={6} style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </Text>
      <Text size="26px" fw={800} c={NAVY} lh={1.2}>
        {value ?? "—"}
      </Text>
    </Box>
  );
}
