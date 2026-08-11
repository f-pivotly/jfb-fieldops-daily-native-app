import { useNavigate, useLocation } from "react-router-dom";
import { Box, Text, Loader, Center } from "@mantine/core";
import AppHeader from "./components/AppHeader";
import PageContent from "./pages/PageContent";
import DashboardPage from "./pages/PageContent/DashboardPage";

import { useNav } from "./hooks/useNav";
import { usePageDetails } from "./hooks/usePageDetails";
import { useAppConfig } from "./contexts/appConfigContext";
import { usePicklistCatalog } from "./hooks/usePicklistCatalog";
import { REQUIRED_PICKLISTS } from "./config/requiredPicklists";
import { SAMPLE_MODE } from "./config/sampleMode";

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { ready, error: configError, fromCache: configFromCache } = useAppConfig();
  const { loading: picklistsLoading, missing: missingPicklists } = usePicklistCatalog(REQUIRED_PICKLISTS);

  const { menuItems, defaultItem, loading: navLoading, fromCache: navFromCache } = useNav();
  const {
    pageData,
    loading: pageLoading,
    error: pageError,
    slug,
    loadPage,
    fromCache: pageFromCache,
  } = usePageDetails();

  const usingCachedShell = configFromCache || navFromCache || pageFromCache;

  // Sample-mode bypass: renders DashboardPage directly with static data instead
  // of waiting on a real Pivotly parent handshake + backend app_page registration
  // (neither exists yet — apg-jfbo-dashboard is still planned, not created). See
  // src/config/sampleMode.js. All the hooks above still get called normally
  // (rules-of-hooks) — they just never fire real network requests since
  // `ready`/`config.appSlug` never resolve without a real parent.
  if (SAMPLE_MODE) {
    return (
      <Box
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          fontFamily: "'Inter', -apple-system, sans-serif",
          fontSize: 13,
        }}
      >
        <AppHeader menuItems={[]} activeSlug={null} onNav={() => {}} navLoading={false} />
        <DashboardPage />
      </Box>
    );
  }

  if (!ready && !configError) {
    return (
      <Center
        style={{
          height: "100vh",
          flexDirection: "column",
          gap: 12,
          background: "#141414",
        }}
      >
        <Loader color="red" size="sm" />
        <Text size="xs" c="#666">
          Waiting for configuration…
        </Text>
      </Center>
    );
  }

  if (configError) {
    return (
      <Center
        style={{
          height: "100vh",
          flexDirection: "column",
          gap: 8,
          background: "#141414",
        }}
      >
        <Text size="xs" c="#ef4444" fw={600}>
          Configuration error
        </Text>
        <Text size="xs" c="#666">
          {configError}
        </Text>
      </Center>
    );
  }

  if (picklistsLoading) {
    return (
      <Center
        style={{
          height: "100vh",
          flexDirection: "column",
          gap: 12,
          background: "#141414",
        }}
      >
        <Loader color="red" size="sm" />
        <Text size="xs" c="#666">
          Loading picklist catalog…
        </Text>
      </Center>
    );
  }

  if (missingPicklists.length > 0) {
    return (
      <Center
        style={{
          height: "100vh",
          flexDirection: "column",
          gap: 8,
          background: "#141414",
        }}
      >
        <Text size="xs" c="#ef4444" fw={600}>
          Configuration error — missing required picklists
        </Text>
        <Text size="xs" c="#666" ta="center" maw={420}>
          {missingPicklists.join(", ")}
        </Text>
      </Center>
    );
  }

  const activeItem =
    menuItems.find((n) => n.path === pathname) ?? defaultItem ?? null;

  const resolvedSlug = activeItem?.page_slug ?? null;

  function handleNav(navItem) {
    navigate(navItem.path);
    loadPage(navItem.page_slug);
  }

  function handleRetry() {
    if (resolvedSlug) loadPage(resolvedSlug);
  }

  return (
    <Box
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        fontFamily: "'Inter', -apple-system, sans-serif",
        fontSize: 13,
      }}
    >
      <AppHeader
        menuItems={menuItems}
        activeSlug={resolvedSlug}
        onNav={handleNav}
        navLoading={navLoading}
      />

      {usingCachedShell && (
        <Box
          py={4}
          style={{
            textAlign: "center",
            fontSize: 11,
            fontWeight: 600,
            color: "#92400e",
            background: "#fef3c7",
            borderBottom: "1px solid #fde68a",
            flexShrink: 0,
          }}
        >
          Offline — showing cached data
        </Box>
      )}

      {activeItem ? (
        <PageContent
          pageData={pageData}
          loading={pageLoading}
          error={pageError}
          slug={slug}
          onRetry={handleRetry}
        />
      ) : (
        <Box
          style={{
            height: "80vh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: 24,
            fontWeight: "bold",
            opacity: 0.7,
          }}
        >
          Select navigation item above
        </Box>
      )}
    </Box>
  );
}
