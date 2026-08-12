import { useState } from "react";
import { Box, Text, ScrollArea } from "@mantine/core";
import {
  IconLayoutDashboard,
  IconBolt,
  IconFolder,
  IconUsers,
  IconLogout,
} from "@tabler/icons-react";
import AdminDashboardSection from "./AdminDashboardSection";
import AdminLiveDataSection from "./AdminLiveDataSection";
import AdminProjectsSection from "./AdminProjectsSection";
import AdminUsersSection from "./AdminUsersSection";
import ProjectDetailShell from "./ProjectDetail/ProjectDetailShell";

const NAV_SECTIONS = [
  {
    section: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: IconLayoutDashboard },
      { id: "livedata", label: "Live Data", icon: IconBolt },
    ],
  },
  {
    section: "Configuration",
    items: [
      { id: "projects", label: "Projects", icon: IconFolder },
      { id: "users", label: "Users", icon: IconUsers },
    ],
  },
];

const SECTION_COMPONENTS = {
  dashboard: AdminDashboardSection,
  livedata: AdminLiveDataSection,
  projects: AdminProjectsSection,
  users: AdminUsersSection,
};

export default function AdminApp({ onExit }) {
  const [screen, setScreen] = useState("dashboard");
  const [configuringProject, setConfiguringProject] = useState(null);
  const ActiveSection = SECTION_COMPONENTS[screen] ?? AdminDashboardSection;

  function handleNavClick(id) {
    setConfiguringProject(null);
    setScreen(id);
  }

  let mainContent;
  if (configuringProject) {
    mainContent = <ProjectDetailShell project={configuringProject} onBack={() => setConfiguringProject(null)} />;
  } else if (screen === "projects") {
    mainContent = <AdminProjectsSection onConfigure={setConfiguringProject} />;
  } else {
    mainContent = <ActiveSection />;
  }

  return (
    <Box
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        fontFamily: "'Inter', -apple-system, sans-serif",
        fontSize: 13,
        background: "#f7f7f7",
      }}
    >
      <Box
        style={{
          width: 200,
          flexShrink: 0,
          background: "#0F2744",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box px={14} py={16} style={{ borderBottom: "1px solid rgba(255,255,255,0.15)" }}>
          <Text fw={700} size="sm" c="#fff" style={{ letterSpacing: ".2px" }}>
            Brennan Field Ops
          </Text>
          <Text size="xs" c="#e7ecf5" mt={4}>
            Back Office
          </Text>
        </Box>

        <ScrollArea flex={1}>
          <Box py={10}>
            {NAV_SECTIONS.map((group) => (
              <Box key={group.section} mb={10}>
                <Text
                  px={14}
                  mb={4}
                  size="10px"
                  fw={700}
                  c="rgba(255,255,255,0.45)"
                  style={{ textTransform: "uppercase", letterSpacing: ".5px" }}
                >
                  {group.section}
                </Text>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = !configuringProject && screen === item.id;
                  return (
                    <Box
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 14px",
                        cursor: "pointer",
                        color: active ? "#fff" : "rgba(255,255,255,0.65)",
                        background: active ? "rgba(255,255,255,0.12)" : "transparent",
                        borderLeft: active ? "2px solid #fff" : "2px solid transparent",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      <Icon size={14} />
                      {item.label}
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        </ScrollArea>

        <Box
          onClick={onExit}
          px={14}
          py={12}
          style={{
            borderTop: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.65)",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <IconLogout size={14} />
          Exit Admin
        </Box>
      </Box>

      <ScrollArea flex={1} style={{ minHeight: 0 }}>
        <Box p={24}>{mainContent}</Box>
      </ScrollArea>
    </Box>
  );
}
