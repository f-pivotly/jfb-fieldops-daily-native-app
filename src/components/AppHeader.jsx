import { Box, Group, ActionIcon, Avatar, Loader } from '@mantine/core'
import { IconBell, IconSettings } from '@tabler/icons-react'
import { useAppConfig } from '../contexts/appConfigContext'

export default function AppHeader({ menuItems = [], activeSlug, onNav, navLoading }) {
  const { config } = useAppConfig()
  const user = config.user ?? { initials: '?', name: '' }
  return (
    <Box
      h={40}
      style={{
        background: '#141414',
        borderBottom: '1px solid #2a2a2a',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 12,
        flexShrink: 0,
        zIndex: 200,
      }}
    >
      {/* Logo */}
      <Group gap={0} mr={6} style={{ flexShrink: 0 }}>
        <Box style={{
          background: '#dc2626', color: '#fff', fontWeight: 900,
          fontSize: 13, letterSpacing: '.5px', padding: '3px 8px', borderRadius: 3,
        }}>
          OFA
        </Box>

      </Group>

      {/* Nav items */}
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
              color: activeSlug === n.page_slug ? '#fff' : '#777',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '.5px',
              cursor: 'pointer',
              borderBottom: activeSlug === n.page_slug ? '2px solid #dc2626' : '2px solid transparent',
              textTransform: 'uppercase',
              transition: 'color .15s',
              whiteSpace: 'nowrap',
            }}
          >
            {n.label}
          </Box>
        ))
      )}

      {/* Right side */}
      <Group gap={10} ml="auto" pr={14} style={{ flexShrink: 0 }}>
        <ActionIcon variant="subtle" color="gray" size="sm">
          <IconBell size={15} color="#555" />
        </ActionIcon>
        <ActionIcon variant="subtle" color="gray" size="sm">
          <IconSettings size={15} color="#555" />
        </ActionIcon>
        <Avatar size={28} title={user.name} style={{ background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          {user.initials}
        </Avatar>
      </Group>
    </Box>
  )
}