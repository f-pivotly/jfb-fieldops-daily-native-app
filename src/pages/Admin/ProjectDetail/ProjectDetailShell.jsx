import { useState } from "react";
import { Box, Text, Tabs } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import AreasTab from "./AreasTab";
import EquipmentTab from "./EquipmentTab";
import DelayCodesTab from "./DelayCodesTab";
import OperatorsTab from "./OperatorsTab";
import CappingSetupTab from "./CappingSetupTab";

export default function ProjectDetailShell({ project, onBack }) {
  const [tab, setTab] = useState("areas");
  const isCapping = (project?.work_type || "").toLowerCase().includes("cap");

  return (
    <Box>
      <Box
        onClick={onBack}
        mb={12}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", color: "#0F2744", fontSize: 12, fontWeight: 600 }}
      >
        <IconArrowLeft size={13} /> Back to Projects
      </Box>

      <Text fw={700} size="lg">{project?.name ?? "Project"}</Text>
      <Text size="xs" c="dimmed" mb={4}>
        {[project?.project_code, project?.client_name, project?.work_type].filter(Boolean).join(" · ") || "—"}
      </Text>
      <Text size="10px" c="dimmed" mb={16}>
        Areas, Equipment, Delay Codes, Operators, and Capping Setup are live.
      </Text>

      <Tabs value={tab} onChange={setTab}>
        <Tabs.List mb={16}>
          <Tabs.Tab value="areas">Areas</Tabs.Tab>
          <Tabs.Tab value="equipment">Equipment</Tabs.Tab>
          <Tabs.Tab value="delaycodes">Delay Codes</Tabs.Tab>
          <Tabs.Tab value="operators">Operators</Tabs.Tab>
          {isCapping && <Tabs.Tab value="capping">Capping Setup</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel value="areas"><AreasTab project={project} /></Tabs.Panel>
        <Tabs.Panel value="equipment"><EquipmentTab project={project} /></Tabs.Panel>
        <Tabs.Panel value="delaycodes"><DelayCodesTab project={project} /></Tabs.Panel>
        <Tabs.Panel value="operators"><OperatorsTab project={project} /></Tabs.Panel>
        {isCapping && <Tabs.Panel value="capping"><CappingSetupTab project={project} /></Tabs.Panel>}
      </Tabs>
    </Box>
  );
}
