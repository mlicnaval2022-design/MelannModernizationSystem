import { Fragment, useEffect, useMemo, useState } from 'react'
import { KeyRound, Pencil, Plus, Save, ShieldCheck, Trash2, UserPlus, UsersRound } from 'lucide-react'
import API from '../services/api'
import { useAuth } from '../context/AuthContext'
import { ACCESS_LEVEL_OPTIONS } from '../access'

const EMPTY_USER = { username: '', password: '', full_name: '', role: '', branch_id: '', is_active: 1 }
const EMPTY_ROLE = { id: null, role_name: '', description: '', status: 'active', permissions: {} }

function permissionMap(items = []) {
  return Object.fromEntries(items.map(item => [item.module_key, item.access_level]))
}

function buildRoleDescription(roleName, permissions, modules, reportTypes) {
  const name = roleName.trim() || 'This role'
  const entries = Object.entries(permissions)
  const selectedModules = entries.filter(([key]) => !key.startsWith('report:'))
  const selectedReportTypes = entries.filter(([key]) => key.startsWith('report:'))
  const moduleScope = selectedModules.length === modules.length && modules.length > 0 ? `all ${modules.length} modules` : `${selectedModules.length} of ${modules.length} modules`
  const reportScope = selectedReportTypes.length === reportTypes.length && reportTypes.length > 0 ? `all ${reportTypes.length} report types` : `${selectedReportTypes.length} of ${reportTypes.length} report types`
  if (entries.length === 0) return `${name} currently has no assigned module or report access.`

  const counts = entries.reduce((result, [, level]) => ({ ...result, [level]: (result[level] || 0) + 1 }), {})
  const levels = Object.keys(counts)
  if (levels.length === 1 && levels[0] === 'view') return `${name} has view-only access to ${moduleScope} and ${reportScope}. This role can view authorized records but cannot add, edit, or delete them.`
  if (levels.length === 1 && levels[0] === 'crud') return `${name} has full CRUD access to ${moduleScope} and ${reportScope}. This role can create, view, update, and delete records within the configured scope.`

  const labels = { view: 'view-only', input: 'input-only', edit: 'edit-only', crud: 'full CRUD' }
  const breakdown = ACCESS_LEVEL_OPTIONS.filter(level => counts[level.value]).map(level => `${counts[level.value]} ${labels[level.value]}`).join(', ')
  return `${name} can access ${moduleScope} and ${reportScope}. Permission assignments: ${breakdown}. Access is restricted to the selected modules and report types, with actions limited by each configured access level.`
}

export default function Users() {
  const { hasPermission, refreshUser } = useAuth()
  const [activeTab, setActiveTab] = useState('role-description')
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [roles, setRoles] = useState([])
  const [modules, setModules] = useState([])
  const [reportTypes, setReportTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_USER)
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE)
  const [saving, setSaving] = useState(false)
  const [roleSaving, setRoleSaving] = useState(false)
  const [error, setError] = useState('')
  const [roleError, setRoleError] = useState('')

  const canView = hasPermission('user-management', 'view')
  const canAdd = hasPermission('user-management', 'input')
  const canEdit = hasPermission('user-management', 'edit')
  const canCrud = hasPermission('user-management', 'crud')
  const activeRoles = useMemo(() => roles.filter(role => role.status === 'active'), [roles])
  const allPermissionKeys = useMemo(() => [...modules.map(module => module.key), ...reportTypes.map(reportType => reportType.key)], [modules, reportTypes])
  const allPermissionsSelected = allPermissionKeys.length > 0 && allPermissionKeys.every(key => Boolean(roleForm.permissions[key]))
  const generatedRoleDescription = useMemo(() => buildRoleDescription(roleForm.role_name, roleForm.permissions, modules, reportTypes), [roleForm.role_name, roleForm.permissions, modules, reportTypes])

  const load = async () => {
    setLoading(true)
    try {
      const [usersRes, branchesRes, rolesRes, modulesRes] = await Promise.all([
        API.get('/users'),
        API.get('/users/branch-options'),
        API.get('/users/roles'),
        API.get('/users/access-modules'),
      ])
      setRows(Array.isArray(usersRes.data) ? usersRes.data : [])
      setBranches(Array.isArray(branchesRes.data) ? branchesRes.data : [])
      setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : [])
      setModules(Array.isArray(modulesRes.data?.modules) ? modulesRes.data.modules : [])
      setReportTypes(Array.isArray(modulesRes.data?.report_types) ? modulesRes.data.report_types : [])
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load User Management data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (canView) load() }, [canView])

  const openNew = () => {
    setEditing(null)
    setForm({ ...EMPTY_USER, role: activeRoles[0]?.role_key || '' })
    setError('')
    setModal(true)
  }

  const openEdit = row => {
    setEditing(row)
    setForm({ username: row.username, password: '', full_name: row.full_name, role: row.role, branch_id: row.branch_id || '', is_active: row.is_active })
    setError('')
    setModal(true)
  }

  const handleSave = async event => {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editing) await API.put(`/users/${editing.id}`, form)
      else await API.post('/users', form)
      setModal(false)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'Error saving user.')
    } finally {
      setSaving(false)
    }
  }

  const newRole = () => {
    setRoleForm(EMPTY_ROLE)
    setRoleError('')
  }

  const editRole = role => {
    setRoleForm({ id: role.id, role_name: role.role_name, description: role.description || '', status: role.status, permissions: permissionMap(role.permissions) })
    setRoleError('')
  }

  const toggleModule = moduleKey => {
    setRoleForm(current => {
      const nextPermissions = { ...current.permissions }
      if (nextPermissions[moduleKey]) {
        delete nextPermissions[moduleKey]
        if (moduleKey === 'reports') reportTypes.forEach(reportType => delete nextPermissions[reportType.key])
      } else {
        nextPermissions[moduleKey] = 'view'
        if (moduleKey === 'reports') reportTypes.forEach(reportType => { nextPermissions[reportType.key] = 'view' })
      }
      return { ...current, permissions: nextPermissions }
    })
  }

  const toggleReportType = reportTypeKey => {
    setRoleForm(current => {
      const nextPermissions = { ...current.permissions }
      if (nextPermissions[reportTypeKey]) {
        delete nextPermissions[reportTypeKey]
        if (!reportTypes.some(item => nextPermissions[item.key])) delete nextPermissions.reports
      } else {
        nextPermissions.reports ||= 'view'
        nextPermissions[reportTypeKey] = 'view'
      }
      return { ...current, permissions: nextPermissions }
    })
  }

  const toggleAllModules = () => {
    setRoleForm(current => {
      if (allPermissionsSelected) return { ...current, permissions: {} }
      const nextPermissions = { ...current.permissions }
      allPermissionKeys.forEach(key => { nextPermissions[key] ||= 'view' })
      return { ...current, permissions: nextPermissions }
    })
  }

  const setModuleAccess = (moduleKey, accessLevel) => {
    setRoleForm(current => ({ ...current, permissions: { ...current.permissions, [moduleKey]: accessLevel } }))
  }

  const saveRole = async event => {
    event.preventDefault()
    setRoleError('')
    setRoleSaving(true)
    const payload = {
      role_name: roleForm.role_name,
      description: generatedRoleDescription,
      status: roleForm.status,
      permissions: Object.entries(roleForm.permissions).map(([module_key, access_level]) => ({ module_key, access_level })),
    }
    try {
      if (roleForm.id) await API.put(`/users/roles/${roleForm.id}`, payload)
      else await API.post('/users/roles', payload)
      newRole()
      await load()
      await refreshUser().catch(() => {})
    } catch (err) {
      setRoleError(err.response?.data?.error || 'Error saving role configuration.')
    } finally {
      setRoleSaving(false)
    }
  }

  const deleteRole = async role => {
    if (!window.confirm(`Delete the role "${role.role_name}"?`)) return
    try {
      await API.delete(`/users/roles/${role.id}`)
      if (roleForm.id === role.id) newRole()
      await load()
    } catch (err) {
      setRoleError(err.response?.data?.error || 'Error deleting role.')
    }
  }

  if (!canView) return <div className="empty-state"><div className="empty-icon">🔐</div><p>Your role does not have access to User Management.</p></div>

  const tabs = [
    { key: 'role-description', label: 'Role Discription', Icon: ShieldCheck },
    { key: 'add-user', label: 'Add User', Icon: UserPlus },
    { key: 'role-configuration', label: 'Role Configuration', Icon: KeyRound },
  ]

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, paddingBottom: 0 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          {tabs.map(tab => {
            const Icon = tab.Icon
            return <button key={tab.key} type="button" className={`btn ${activeTab === tab.key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab(tab.key)}><Icon size={15} /> {tab.label}</button>
          })}
        </div>
      </div>

      {error && !modal && <div className="login-error" style={{ marginBottom: 14 }}>{error}</div>}

      {activeTab === 'role-description' && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 6 }}>Role Discription</div>
          <p style={{ margin: '0 0 18px', color: 'var(--text-muted)', fontSize: 13 }}>Position-based roles and their responsibilities in the system.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {loading ? <div className="empty-state">Loading roles...</div> : roles.map(role => (
              <article key={role.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div><div style={{ fontWeight: 800, color: 'var(--blue-dark)', fontSize: 15 }}>{role.role_name}</div><div className="mono" style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>{role.role_key}</div></div>
                  <span className={`badge badge-${role.status === 'active' ? 'active' : 'inactive'}`}>{role.status}</span>
                </div>
                <p style={{ color: '#475569', fontSize: 13, lineHeight: 1.55, minHeight: 40 }}>{role.description || 'No role description yet.'}</p>
                <div style={{ display: 'flex', gap: 14, color: 'var(--text-muted)', fontSize: 12 }}><span><strong>{role.user_count || 0}</strong> users</span><span><strong>{role.module_count || 0}</strong> modules</span></div>
              </article>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'add-user' && (
        <>
          <div className="page-toolbar">
            {(canAdd || canCrud) && <button id="btn-new-user" className="btn btn-primary" onClick={openNew}><Plus size={15} /> New User</button>}
          </div>
          <div className="card">
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Username</th><th>Full Name</th><th>Position / Role</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {loading ? <tr className="loading-row"><td colSpan={6}>Loading...</td></tr> : rows.length === 0 ? <tr><td colSpan={6} className="empty-state">No users found.</td></tr> : rows.map(row => (
                    <tr key={row.id}>
                      <td><span className="mono">{row.username}</span></td>
                      <td className="fw-600">{row.full_name}</td>
                      <td><span className="badge badge-active">{row.role_name || row.role}</span></td>
                      <td>{row.branch_name || 'All Branches'}</td>
                      <td><span className={`badge badge-${row.is_active ? 'active' : 'inactive'}`}>{row.is_active ? 'Active' : 'Inactive'}</span></td>
                      <td>{(canEdit || canCrud) ? <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}><Pencil size={13} /> Edit</button> : <span style={{ color: 'var(--text-muted)' }}>View only</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'role-configuration' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16, alignItems: 'start' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 14 }}><div className="card-title">Configured Roles</div>{canCrud && <button type="button" className="btn btn-primary btn-sm" onClick={newRole}><Plus size={14} /> New Role</button>}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {roles.map(role => (
                <button key={role.id} type="button" onClick={() => editRole(role)} style={{ textAlign: 'left', padding: 12, border: roleForm.id === role.id ? '1px solid var(--blue-mid)' : '1px solid var(--border)', background: roleForm.id === role.id ? 'rgba(37,99,235,0.06)' : '#fff', borderRadius: 8, cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{role.role_name}</strong><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{role.module_count || 0} modules{role.report_type_count ? ` • ${role.report_type_count} report types` : ''}</span></div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>{role.user_count || 0} assigned users</div>
                </button>
              ))}
            </div>
          </div>

          <form className="card" onSubmit={saveRole}>
            <div className="card-title" style={{ marginBottom: 14 }}>{roleForm.id ? `Edit ${roleForm.role_name}` : 'Add Position-Based Role'}</div>
            {!canCrud && <div className="login-error" style={{ marginBottom: 14 }}>Your access is view-only. CRUD permission is required to change role configurations.</div>}
            {roleError && <div className="login-error" style={{ marginBottom: 14 }}>{roleError}</div>}
            <div className="form-grid" style={{ marginBottom: 16 }}>
              <div className="form-group"><label className="form-label">Position / Role Name *</label><input className="form-control" placeholder="e.g. Collector, Cashier, Branch Manager" value={roleForm.role_name} onChange={event => setRoleForm(current => ({ ...current, role_name: event.target.value }))} required disabled={!canCrud} /></div>
              <div className="form-group"><label className="form-label">Status</label><select className="form-control" value={roleForm.status} onChange={event => setRoleForm(current => ({ ...current, status: event.target.value }))} disabled={!canCrud || roles.find(role => role.id === roleForm.id)?.role_key === 'admin'}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Role Description <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>(Automatically Generated)</span></label><textarea className="form-control" rows={4} value={generatedRoleDescription} readOnly style={{ background: '#f8fafc', lineHeight: 1.5 }} /><div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 5 }}>This description updates automatically from the selected modules, report types, and access levels.</div></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end', marginBottom: 10 }}><div><div style={{ fontWeight: 800, color: 'var(--blue-dark)' }}>Module Checklist</div><div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>Check allowed modules, then choose View Only, Input, Edit, or full CRUD.</div></div><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{Object.keys(roleForm.permissions).length} selected</div></div>
            <div className="table-wrapper" style={{ maxHeight: 430, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table className="data-table">
                <thead><tr><th style={{ width: 120 }}><label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: canCrud ? 'pointer' : 'default' }}><input type="checkbox" checked={allPermissionsSelected} onChange={toggleAllModules} disabled={!canCrud || allPermissionKeys.length === 0} aria-label="Select all modules and report types" /> Select All</label></th><th>Module</th><th>Section</th><th style={{ width: 180 }}>Access Level</th></tr></thead>
                <tbody>{modules.map(module => {
                  const selected = Boolean(roleForm.permissions[module.key])
                  return <Fragment key={module.key}>
                    <tr><td className="text-center"><input type="checkbox" checked={selected} onChange={() => toggleModule(module.key)} disabled={!canCrud} /></td><td className="fw-600">{module.label}</td><td>{module.section}</td><td><select className="form-control" style={{ minWidth: 150 }} value={roleForm.permissions[module.key] || 'view'} onChange={event => setModuleAccess(module.key, event.target.value)} disabled={!selected || !canCrud}>{ACCESS_LEVEL_OPTIONS.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}</select></td></tr>
                    {module.key === 'reports' && reportTypes.map(reportType => {
                      const reportSelected = Boolean(roleForm.permissions[reportType.key])
                      return <tr key={reportType.key} style={{ background: '#f8fafc' }}><td className="text-center"><input type="checkbox" checked={reportSelected} onChange={() => toggleReportType(reportType.key)} disabled={!canCrud} /></td><td style={{ paddingLeft: 34 }}><span style={{ color: 'var(--blue-mid)', marginRight: 8 }}>↳</span><span className="fw-600">{reportType.label}</span></td><td><span className="badge badge-active">Report Type</span></td><td><select className="form-control" style={{ minWidth: 150 }} value={roleForm.permissions[reportType.key] || 'view'} onChange={event => setModuleAccess(reportType.key, event.target.value)} disabled={!reportSelected || !canCrud}>{ACCESS_LEVEL_OPTIONS.map(level => <option key={level.value} value={level.value}>{level.label}</option>)}</select></td></tr>
                    })}
                  </Fragment>
                })}</tbody>
              </table>
            </div>

            {canCrud && <div className="form-actions" style={{ justifyContent: 'space-between' }}><div>{roleForm.id && !roles.find(role => role.id === roleForm.id)?.is_system && <button type="button" className="btn btn-danger" onClick={() => deleteRole(roles.find(role => role.id === roleForm.id))}><Trash2 size={14} /> Delete Role</button>}</div><div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn btn-secondary" onClick={newRole}>Clear</button><button type="submit" className="btn btn-primary" disabled={roleSaving}><Save size={15} /> {roleSaving ? 'Saving...' : roleForm.id ? 'Save Role Changes' : 'Add Role'}</button></div></div>}
          </form>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onMouseDown={event => event.target === event.currentTarget && setModal(false)}>
          <div className="modal">
            <div className="modal-header"><span className="modal-title"><UsersRound size={18} /> {editing ? 'Edit User' : 'New User'}</span><button className="modal-close" onClick={() => setModal(false)}>x</button></div>
            <div className="modal-body">
              {error && <div className="login-error" style={{ marginBottom: 14 }}>{error}</div>}
              <form onSubmit={handleSave}>
                <div className="form-grid">
                  <div className="form-group"><label className="form-label">Full Name *</label><input className="form-control" value={form.full_name} onChange={event => setForm(current => ({ ...current, full_name: event.target.value }))} required /></div>
                  <div className="form-group"><label className="form-label">Username *</label><input className="form-control" value={form.username} onChange={event => setForm(current => ({ ...current, username: event.target.value }))} required disabled={Boolean(editing)} /></div>
                  <div className="form-group"><label className="form-label">{editing ? 'New Password (leave blank to keep)' : 'Password *'}</label><input type="password" className="form-control" value={form.password} onChange={event => setForm(current => ({ ...current, password: event.target.value }))} required={!editing} minLength={6} /></div>
                  <div className="form-group"><label className="form-label">Position / Role *</label><select className="form-control" value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))} required><option value="">Select role...</option>{roles.filter(role => role.status === 'active' || role.role_key === form.role).map(role => <option key={role.id} value={role.role_key}>{role.role_name}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Branch</label><select className="form-control" value={form.branch_id} onChange={event => setForm(current => ({ ...current, branch_id: event.target.value }))}><option value="">All Branches</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.branch_name}</option>)}</select></div>
                  {editing && <div className="form-group"><label className="form-label">Status</label><select className="form-control" value={form.is_active} onChange={event => setForm(current => ({ ...current, is_active: Number(event.target.value) }))}><option value={1}>Active</option><option value={0}>Inactive</option></select></div>}
                </div>
                <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create User'}</button></div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
