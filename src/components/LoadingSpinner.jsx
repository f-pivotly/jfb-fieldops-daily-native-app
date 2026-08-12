import { Center, Loader } from '@mantine/core'

export default function LoadingSpinner({ py = 20 }) {
  return (
    <Center py={py}><Loader color="brennanNavy" size="sm" /></Center>
  )
}
