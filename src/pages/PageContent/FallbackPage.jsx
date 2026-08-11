import { Box, ScrollArea } from "@mantine/core";
import DomainDataTable from "../../components/DomainDataTable";
import Section from "./Section";
import PageIdentityBar from "./PageIdentityBar";


export default function FallbackPage({ page, claims, data_access, actions, pageData, sections, domainSources }) {
  return (
    <Box
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {page && <PageIdentityBar page={page} />}

      <ScrollArea flex={1} style={{ minHeight: 0, background: "#f7f7f7" }}>
        <Box p={24}>
          {sections.map(
            (s) =>
              s.data != null && (
                <Section key={s.key} title={s.title} data={s.data} />
              ),
          )}

          {/* Fallback: show full raw response if structure is unexpected */}
          {!page && !claims && !data_access && !actions && (
            <Section title="Raw Response" data={pageData} />
          )}

          {domainSources.map((s) => (
            <DomainDataTable
              key={s.domain}
              domain={s.domain}
              system={s.system || "core"}
              actions={actions}
            />
          ))}
        </Box>
      </ScrollArea>
    </Box>
  );
}
