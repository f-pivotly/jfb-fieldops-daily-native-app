import { Center, Loader } from '@mantine/core'

export default function LoadingSpinner({ py = 20 }) {
  return (
    <Center py={py}><Loader color="red" size="sm" /></Center>
  )
}
