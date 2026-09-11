import { api, fetchCurrentUser, fetchFileById, createDomainRecord } from '../../../data'

export async function downloadAndLogReport({ result, filename, appSlug, recordData }) {
  const fileRes = await api.get(result.downloadUrl, { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(new Blob([fileRes.data], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(blobUrl)

 
  try {
    const [me, file] = await Promise.all([
      fetchCurrentUser(),
      result.fileKey ? fetchFileById(result.fileKey) : Promise.resolve(null),
    ])
    await createDomainRecord({
      domain: 'jfb_report_generations',
      system: 'core',
      appSlug,
      recordData: {
        ...recordData,
        generated_at: new Date().toISOString(),
        generated_by_user_id: me.id,
        generated_by_email: me.email,
        file_id: result.fileKey ?? null,
        file_name: file?.logicalName ?? null,
        file_path: file?.storagePath ?? null,
        download_url: result.downloadUrl,
      },
    })
  } catch (logErr) {
    console.error('Failed to log report generation:', logErr.message)
  }
}
