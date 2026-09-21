import { useState } from 'react'
import { useConfirmDialog } from './useConfirmDialog'

export function useCrudModal({
  emptyForm,
  toForm,
  toPayload,
  contextFromRow,
  onCreate,
  onUpdate,
  onDelete,
  confirmMessage,
}) {
  const { confirm, modal: confirmModal } = useConfirmDialog()
  const [modalOpen, setModalOpen] = useState(false)
  const [editRow, setEditRow] = useState(null)
  const [context, setContext] = useState(null)
  const [form, setForm] = useState(() => emptyForm(null))

  function openAdd(ctx = null) {
    setEditRow(null)
    setContext(ctx)
    setForm(emptyForm(ctx))
    setModalOpen(true)
  }

  function openEdit(row) {
    setEditRow(row)
    setContext(contextFromRow ? contextFromRow(row) : null)
    setForm(toForm(row))
    setModalOpen(true)
  }

  function setFormField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function save() {
    const payload = toPayload(form, { editRow, context })
    if (!payload) return
    if (editRow) {
      await onUpdate(editRow.id, payload)
    } else {
      await onCreate(payload)
    }
    setModalOpen(false)
  }

  async function remove(row) {
    if (!(await confirm(confirmMessage(row)))) return
    await onDelete(row.id)
  }

  return { modalOpen, setModalOpen, editRow, form, setFormField, context, openAdd, openEdit, save, remove, confirmModal }
}
