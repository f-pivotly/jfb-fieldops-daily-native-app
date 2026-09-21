import { makeListHook } from '../core/domainHookFactory'

export const useProjectAttachments = makeListHook('jfb_project_attachments', 'attachments', 'project')
