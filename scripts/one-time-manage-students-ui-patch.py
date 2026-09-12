import base64, json, os, urllib.error, urllib.request

OWNER = 'aliganey2016000-del'
REPO = 'minhaj-platform-v1'
BRANCH = 'fix/manage-students-table-ui'
TARGET = 'apps/frontend/src/features/admin/pages/students-manage.tsx'
TOKEN = os.environ['GH_TOKEN']
BASE = f'https://api.github.com/repos/{OWNER}/{REPO}/contents/'


def api(method, path, payload=None):
    body = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(
        BASE + path,
        data=body,
        method=method,
        headers={
            'Authorization': f'Bearer {TOKEN}',
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2026-03-10',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())


file = api('GET', f'{TARGET}?ref={BRANCH}')
text = base64.b64decode(file['content']).decode('utf-8-sig')

actions_start = text.find('  const renderActions = (student: Student) =>')
actions_end = text.find('\n\n  return <div', actions_start)
if actions_start < 0 or actions_end < 0:
    raise RuntimeError('Manage Students actions block not found')

new_actions = '''  const renderActions = (student: Student, desktop = false) => desktop ? <details className="relative flex justify-end" onClick={event => event.stopPropagation()}>
            <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)] [&::-webkit-details-marker]:hidden" aria-label="Student actions" title="Student actions"><MoreVertical className="h-5 w-5" /></summary>
            <div className="absolute right-0 top-10 z-50 w-36 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-1 shadow-xl">
              <button onClick={event => { event.stopPropagation(); setModal({ open: true, student }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-secondary)]"><Pencil className="h-4 w-4" /> Edit</button>
              <button onClick={event => { event.stopPropagation(); setProfileStudent(student); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-[var(--color-surface-secondary)]"><GraduationCap className="h-4 w-4" /> View</button>
              <button onClick={event => { event.stopPropagation(); removeStudent(student._id); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>
            </div>
          </details> : <div className="flex items-center justify-end gap-1">
            <div className="mr-2 h-9 w-9 overflow-hidden rounded-full bg-primary-50 text-center text-xs font-bold leading-9 text-primary-700" title="Profile photo">{student.profile?.avatar ? <img src={student.profile.avatar} alt="" className="h-full w-full object-cover" /> : [student.profile?.firstName?.[0] || '', student.profile?.lastName?.[0] || ''].join('').toUpperCase()}</div>
            <button title="View profile" onClick={event => { event.stopPropagation(); setProfileStudent(student); }} className="rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"><GraduationCap className="h-4 w-4" /></button><button title="Edit" onClick={event => { event.stopPropagation(); setModal({ open: true, student }); }} className="rounded-lg p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"><Pencil className="h-4 w-4" /></button>
            <button title="Delete" onClick={event => { event.stopPropagation(); removeStudent(student._id); }} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
          </div>;
'''
text = text[:actions_start] + new_actions + text[actions_end:]

table_start = text.find('        <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[820px] text-left text-sm">')
mobile_start = text.find('        <div className="divide-y divide-[var(--color-border-subtle)] lg:hidden">', table_start)
if table_start < 0 or mobile_start < 0:
    raise RuntimeError('Manage Students desktop table block not found')

new_table = '''        <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[900px] table-fixed text-left text-sm"><thead className="bg-[var(--color-surface-secondary)] text-xs uppercase tracking-wide text-[var(--color-text-tertiary)]"><tr><th className="w-10 px-4 py-3" /><th className="w-[22%] px-4 py-3">Name / ID</th><th className="w-[24%] px-4 py-3">Email / Phone</th><th className="w-[25%] px-4 py-3">Depart / Class</th><th className="w-[12%] px-4 py-3">Status</th><th className="w-[12%] px-4 py-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[var(--color-border-subtle)]">{students.map(student => <tr key={student._id} onClick={() => setProfileStudent(student)} className="cursor-pointer hover:bg-[var(--color-surface-secondary)]"><td className="px-4 py-3"><input type="checkbox" checked={selected.includes(student._id)} onClick={event => event.stopPropagation()} onChange={() => setSelected(value => value.includes(student._id) ? value.filter(id => id !== student._id) : [...value, student._id])} /></td><td className="px-4 py-3 align-middle"><div className="font-semibold text-[var(--color-text-primary)]">{student.profile?.firstName} {student.profile?.lastName}</div><div className="font-mono text-xs text-[var(--color-text-secondary)]">{student.studentId}</div></td><td className="px-4 py-3 align-middle text-xs text-[var(--color-text-tertiary)]"><div className="truncate">{student.user?.email || 'No email'}</div><div className="truncate">{student.user?.phone || 'No phone'}</div></td><td className="px-4 py-3 align-middle"><div className="font-medium text-[var(--color-text-primary)]">{academicLabel(student)}</div><div className="text-xs text-[var(--color-text-tertiary)]">{classLabel(student)}</div></td><td className="px-4 py-3 align-middle"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadge[student.status] || statusBadge.inactive}`}>{student.status}</span></td><td className="px-4 py-3 align-middle">{renderActions(student, true)}</td></tr>)}</tbody></table></div>
'''
text = text[:table_start] + new_table + text[mobile_start:]

api('PUT', TARGET, {
    'message': 'fix(admin): polish Manage Students desktop table',
    'content': base64.b64encode(text.encode()).decode(),
    'sha': file['sha'],
    'branch': BRANCH,
})

for temp_path in [
    '.github/workflows/one-time-student-table-ui-patch.yml',
    '.github/workflows/fix-one-time-patch-workflow.yml',
    '.github/workflows/temporary-manage-students-ui-bridge.yml',
    'scripts/one-time-manage-students-ui-patch.py',
    'TEMP_MANAGE_STUDENTS_UI_TRIGGER.txt',
    'TEMP_MANAGE_STUDENTS_UI_TRIGGER_2.txt',
    'TEMP_MANAGE_STUDENTS_UI_TRIGGER_3.txt',
]:
    try:
        temp = api('GET', f'{temp_path}?ref={BRANCH}')
        api('DELETE', temp_path, {
            'message': 'chore: remove temporary Manage Students UI bridge files',
            'sha': temp['sha'],
            'branch': BRANCH,
        })
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise

print('Manage Students UI patch completed.')
