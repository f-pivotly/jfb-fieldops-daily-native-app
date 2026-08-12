import { Link } from 'react-router-dom'
import { Box, ScrollArea, Text, Group, Tabs, Table } from '@mantine/core'
import {
  SAMPLE_LAYERS,
  SAMPLE_MATERIALS,
  SAMPLE_COMPONENTS,
  SAMPLE_LAYER_MATERIAL_MAP,
  SAMPLE_MATERIAL_COMPONENT_MAP,
} from '../../data/cappingSetupSampleData'

export default function CappingSetupPage() {
  return (
    <ScrollArea flex={1} style={{ minHeight: 0 }}>
      <Box p={24} maw={900} mx="auto">
        <Group justify="space-between" mb={4}>
          <Text fw={700} size="lg">Capping Setup</Text>
          <Link to="/" style={{ fontSize: 13 }}>← Dashboard</Link>
        </Group>
        <Text size="sm" c="dimmed" mb={16}>
          Layers / materials / components + mappings for capping projects (e.g. Cocoa Beach Capping).
        </Text>

        <Tabs defaultValue="layers">
          <Tabs.List mb={12}>
            <Tabs.Tab value="layers">Layers</Tabs.Tab>
            <Tabs.Tab value="materials">Materials</Tabs.Tab>
            <Tabs.Tab value="components">Components</Tabs.Tab>
            <Tabs.Tab value="mappings">Mappings &amp; Goals</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="layers">
            <Text size="xs" c="dimmed" mb={8}>The cap layers / lifts placed on this project (e.g. Lift 1–6, Armor).</Text>
            <Table withTableBorder verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th ta="right">Sort</Table.Th><Table.Th>Report Name</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {SAMPLE_LAYERS.map((l) => (
                  <Table.Tr key={l.id}><Table.Td>{l.name}</Table.Td><Table.Td>{l.type}</Table.Td><Table.Td ta="right">{l.sortOrder}</Table.Td><Table.Td>{l.reportName}</Table.Td></Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Tabs.Panel>

          <Tabs.Panel value="materials">
            <Text size="xs" c="dimmed" mb={8}>The materials placed (e.g. Sand, Gravel, Armor Rock, Amended Sand).</Text>
            <Table withTableBorder verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th ta="right">Sort</Table.Th><Table.Th>Report Name</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {SAMPLE_MATERIALS.map((m) => (
                  <Table.Tr key={m.id}><Table.Td>{m.name}</Table.Td><Table.Td>{m.type}</Table.Td><Table.Td ta="right">{m.sortOrder}</Table.Td><Table.Td>{m.reportName}</Table.Td></Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Tabs.Panel>

          <Tabs.Panel value="components">
            <Text size="xs" c="dimmed" mb={8}>Sub-materials tracked for inventory (used when a material is a blend).</Text>
            <Table withTableBorder verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th>Report UOM</Table.Th><Table.Th>Inventory UOM</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {SAMPLE_COMPONENTS.map((c) => (
                  <Table.Tr key={c.id}><Table.Td>{c.name}</Table.Td><Table.Td>{c.type}</Table.Td><Table.Td>{c.reportUom}</Table.Td><Table.Td>{c.invUom}</Table.Td></Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Tabs.Panel>

          <Tabs.Panel value="mappings">
            <Text fw={600} size="sm" mb={6}>Layer → Material</Text>
            <Table withTableBorder verticalSpacing="xs" fz="sm" mb={20}>
              <Table.Thead><Table.Tr><Table.Th>Layer</Table.Th><Table.Th>Material</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {SAMPLE_LAYER_MATERIAL_MAP.map((m, i) => (
                  <Table.Tr key={i}><Table.Td>{m.layer}</Table.Td><Table.Td>{m.material}</Table.Td></Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            <Text fw={600} size="sm" mb={6}>Material → Component</Text>
            <Table withTableBorder verticalSpacing="xs" fz="sm">
              <Table.Thead><Table.Tr><Table.Th>Material</Table.Th><Table.Th>Component</Table.Th><Table.Th ta="right">%/Ratio</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {SAMPLE_MATERIAL_COMPONENT_MAP.map((m, i) => (
                  <Table.Tr key={i}><Table.Td>{m.material}</Table.Td><Table.Td>{m.component}</Table.Td><Table.Td ta="right">{m.pctOrRatio}</Table.Td></Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Tabs.Panel>
        </Tabs>
      </Box>
    </ScrollArea>
  )
}
