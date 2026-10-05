import { Text } from '@mantine/core'
import SafeError from './SafeError'

export default function PdfJobStatus({ job, ...rest }) {
  if (job.busy) {
    return (
      <Text size="xs" c="dimmed" {...rest}>
        Generating PDF… {job.elapsedSeconds}s. This can take up to a minute for reports with photos and charts.
      </Text>
    )
  }
  return <SafeError message={job.error} {...rest} />
}
