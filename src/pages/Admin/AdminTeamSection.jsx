import { useState } from "react";
import { Box, Text } from "@mantine/core";
import { useAppConfig } from "../../contexts/appConfigContext";
import { fetchRecordPage, likeFilter } from "../../data";
import TeamTab from "./ProjectDetail/TeamTab";
import ServerPagedSelect from "../../components/ServerPagedSelect";

export default function AdminTeamSection() {
  const { config } = useAppConfig();
  const [selectedProject, setSelectedProject] = useState(null);

  async function fetchProjectOptions({ search, page, pageSize }) {
    const nameFilter = likeFilter(search);
    const { rows, hasNext } = await fetchRecordPage({
      domain: "jfb_projects", appSlug: config.appSlug, page, pageSize,
      filters: { is_active: true, ...(nameFilter ? { name: nameFilter } : {}) },
      sortCol: "name", sortDir: "asc",
    });
    return { items: rows.map((p) => ({ value: p.id, label: p.name, project: p })), hasNext };
  }

  return (
    <Box>
      <Text fw={700} size="lg" mb={4}>Team</Text>
      <Text size="xs" c="dimmed" mb={16}>Assign PE/PM users to a project's team</Text>

      <ServerPagedSelect
        label="Project"
        placeholder="Search or choose a project"
        fetchPage={fetchProjectOptions}
        value={selectedProject?.id ?? null}
        selectedLabel={selectedProject?.name ?? null}
        onChange={(v, item) => setSelectedProject(item?.project ?? null)}
        nothingFoundMessage="No matching projects"
        noun="project"
        mb={20}
        w={360}
      />

      <TeamTab project={selectedProject} />
    </Box>
  );
}
