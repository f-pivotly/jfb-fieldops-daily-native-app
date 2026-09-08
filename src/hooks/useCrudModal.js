import { useState } from 'react'
import { useConfirmDialog } from './useConfirmDialog'

// Shared "add/edit modal + delete confirm" state machine behind
// CappingSetupTab's five nearly-identical CRUD-table components
// (NamedTypeTable, ComponentsTable, and the three mapping tables) --
// each keeps its own toForm/toPayload field mapping and its own render,
// only the modalOpen/editRow/form bookkeeping and openAdd/openEdit/save/
// remove handlers were duplicated.
export function useCrudModal({
  emptyForm, // (context) => initial form object, e.g. () => ({ name: '', ... })
  toForm, // (row) => form object, for populating the Edit modal
  toPayload, // (form, { editRow, context }) => payload, or falsy to abort save
  contextFromRow, // optional: (row) => context, set when opening Edit (mapping tables' parent id)
  onCreate,
  onUpdate,
  onDelete,
  confirmMessage, // (row) => string, shown before delete
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
