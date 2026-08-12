import { Box, Group, ActionIcon, Avatar, Loader, Text } from '@mantine/core'
import { IconBell, IconSettings } from '@tabler/icons-react'
import { useAppConfig } from '../contexts/appConfigContext'

export default function AppHeader({ menuItems = [], activeSlug, onNav, navLoading }) {
  const { config } = useAppConfig()
  const user = config.user ?? { initials: '?', name: '' }
  return (
    <Box
      h={40}
      style={{
        background: '#0F2744',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 14,
        flexShrink: 0,
        zIndex: 200,
      }}
    >
      <Group gap={0} mr={14} style={{ flexShrink: 0 }}>
        <Text fw={700} size="sm" c="#fff" style={{ letterSpacing: '.3px', whiteSpace: 'nowrap' }}>
          Brennan Field Ops
        </Text>
      </Group>

      {navLoading ? (
        <Loader size={12} color="gray" ml={10} />
      ) : (
        menuItems.map(n => (
          <Box
            key={n.page_slug}
            onClick={() => onNav(n)}
            style={{
              height: 40,
              display: 'flex',
              alignItems: 'center',
              padding: '0 14px',
              color: activeSlug === n.page_slug ? '#fff' : 'rgba(255,255,255,0.55)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '.5px',
              cursor: 'pointer',
              borderBottom: activeSlug === n.page_slug ? '2px solid #fff' : '2px solid transparent',
              textTransform: 'uppercase',
              transition: 'color .15s',
              whiteSpace: 'nowrap',
            }}
          >
            {n.label}
          </Box>
        ))
      )}

      <Group gap={10} ml="auto" pr={14} style={{ flexShrink: 0 }}>
        <ActionIcon variant="subtle" color="gray" size="sm">
          <IconBell size={15} color="rgba(255,255,255,0.6)" />
        </ActionIcon>
        <ActionIcon variant="subtle" color="gray" size="sm">
          <IconSettings size={15} color="rgba(255,255,255,0.6)" />
        </ActionIcon>
        <Avatar size={28} title={user.name} style={{ background: '#1A5CA8', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {user.initials}
        </Avatar>
      </Group>
    </Box>
  )
}