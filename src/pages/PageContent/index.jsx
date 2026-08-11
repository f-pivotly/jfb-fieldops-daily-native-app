import { Box, Text, Loader, Center } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import SafeError from "../../components/SafeError";
import FallbackPage from "./FallbackPage";
import CrewRosterPage from "./CrewRosterPage";

const CREW_ROSTER_PAGE_SLUG = "apg-ofa_person";

export default function PageContent({
  pageData,
  loading,
  error,
  slug,
  onRetry,
}) {
  const inner = pageData?.data || pageData;
  const { page, claims, data_access, actions } = inner ?? {};

  if (!pageData) return null;

  if (!slug && !loading) {
    return (
      <Center
        style={{
          flex: 1,
          flexDirection: "column",
          gap: 10,
          background: "#f7f7f7",
        }}
      >
        <Text size="sm" c="#ccc" fw={600}>
          Select a page from the navigation
        </Text>
      </Center>
    );
  }

  if (loading) {
    return (
      <Center
        style={{
          flex: 1,
          flexDirection: "column",
          gap: 12,
          background: "#f7f7f7",
        }}
      >
        <Loader color="red" size="sm" />
        <Text size="xs" c="#aaa">
          Loading page details for <strong>{slug}</strong>…
        </Text>
      </Center>
    );
  }

  if (error) {
    return (
      <Center
        style={{
          flex: 1,
          flexDirection: "column",
          gap: 10,
          background: "#f7f7f7",
        }}
      >
        <Text size="sm" c="#ef4444" fw={600}>
          Failed to load page
        </Text>
        <SafeError message={error} c="#aaa" />
        <Box
          onClick={onRetry}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "#dc2626",
            cursor: "pointer",
            marginTop: 4,
          }}
        >
          <IconRefresh size={13} /> Retry
        </Box>
      </Center>
    );
  }

  const domainSources = (
    Array.isArray(data_access) ? data_access : [data_access]
  ).filter((s) => s?.source_type === "domain" && s?.domain);

  const sections = [
    { key: "page", title: "Page Definition", data: page },
    { key: "data_access", title: "Data Access", data: data_access },
    { key: "claims", title: "Claims", data: claims },
    { key: "actions", title: "Actions", data: actions },
  ];

  if (slug === CREW_ROSTER_PAGE_SLUG) {
    const personSource = domainSources[0];
    return (
      <CrewRosterPage
        domain={personSource?.domain}
        system={personSource?.system}
        actions={actions}
      />
    );
  }

  return (
    <FallbackPage
      page={page}
      claims={claims}
      data_access={data_access}
      actions={actions}
      pageData={pageData}
      sections={sections}
      domainSources={domainSources}
    />
  );
}
