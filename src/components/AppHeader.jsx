import { Link } from 'react-router-dom'
import { Box, Group, Avatar, Text } from '@mantine/core'
import { useAppConfig } from '../contexts/appConfigContext'
import { useFieldOpsAction } from '../contexts/fieldOpsAccessContext'

export default function AppHeader() {
  const { config } = useAppConfig()
  const canViewOperatorHours = useFieldOpsAction('view_operator_hours')
  const user = config.user ?? { initials: '?', name: '' }
  return (
    <Box
      style={{
        background: '#0F2744',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        display: 'flex',
        alignItems: 'center',
        padding: '8px 14px',
        flexShrink: 0,
        zIndex: 200,
      }}
    >
      <Box component={Link} to="/" style={{ textDecoration: 'none', flexShrink: 0, lineHeight: 1.25 }}>
        <Text fw={700} size="sm" c="#fff" style={{ letterSpacing: '.3px', whiteSpace: 'nowrap' }}>
          Brennan Field Ops
        </Text>
        <Text size="xs" c="rgba(255,255,255,0.65)" style={{ whiteSpace: 'nowrap' }}>
          Daily Report System
        </Text>
      </Box>

      <Group gap={10} ml="auto" style={{ flexShrink: 0 }}>
        {canViewOperatorHours && (
          <Box
            component={Link}
            to="/admin/operators"
            style={{
              color: '#fff',
              fontSize: 12,
              padding: '4px 10px',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 4,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Operators
          </Box>
        )}
        <Avatar size={28} title={user.name} style={{ background: '#1A5CA8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {user.initials}
        </Avatar>
      </Group>
    </Box>
  )
}
