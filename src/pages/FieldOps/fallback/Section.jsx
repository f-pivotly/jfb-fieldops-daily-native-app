import { Box, Text, Code } from "@mantine/core";

export default function Section({ title, data }) {
  return (
    <Box
      style={{
        background: "#fff",
        border: "1px solid #ebebeb",
        borderRadius: 6,
        overflow: "hidden",
        marginBottom: 16,
      }}
    >
      <Box
        px={16}
        py={10}
        style={{ background: "#f9f9f9", borderBottom: "1px solid #ebebeb" }}
      >
        <Text
          size="xs"
          fw={700}
          style={{
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: "#888",
          }}
        >
          {title}
        </Text>
      </Box>
      <Box p={16}>
        <Code
          block
          style={{
            fontSize: 11,
            lineHeight: 1.7,
            background: "#f7f7f7",
            border: "1px solid #ebebeb",
            borderRadius: 4,
            padding: 14,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            color: "#333",
          }}
        >
          {JSON.stringify(data, null, 2)}
        </Code>
      </Box>
    </Box>
  );
}
