import { useState } from "react";
import { Box, Text, Select } from "@mantine/core";
import { useDomainData } from "../../hooks/useDomainData";
import TeamTab from "./ProjectDetail/TeamTab";

export default function AdminTeamSection() {
  const { records: projects, loading } = useDomainData({ domain: "jfb_projects", system: "core" });
  const [projectId, setProjectId] = useState(null);

  const activeProjects = projects.filter((p) => p.is_active);
  const selectedProject = activeProjects.find((p) => p.id === projectId) ?? null;

  return (
    <Box>
      <Text fw={700} size="lg" mb={4}>Team</Text>
      <Text size="xs" c="dimmed" mb={16}>Assign PE/PM users to a project's team</Text>

      <Select
        label="Project"
        placeholder={loading ? "Loading…" : "Choose a project"}
        data={activeProjects.map((p) => ({ value: p.id, label: p.name }))}
        value={projectId}
        onChange={setProjectId}
        searchable
        disabled={loading}
        mb={20}
        w={360}
      />

      <TeamTab project={selectedProject} />
    </Box>
  );
}
