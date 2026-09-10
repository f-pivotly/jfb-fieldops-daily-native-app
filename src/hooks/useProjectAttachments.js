import { makeListHook } from './domainHookFactory'

export const useProjectAttachments = makeListHook('jfb_project_attachments', 'attachments', 'project')
