"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Copy, Lock, Shield, UserCog } from "lucide-react";
import type { WorkspaceData } from "@/lib/operations-types";
import type { PermissionGroup } from "@/lib/permissions";

import { Badge, Banner, Button, Card, EmptyState, Field, Input, Overlay, SkeletonTable } from "@/components/ui";
import { queryWorkspace } from "@/components/workspace/client";
import { SubmitFn } from "@/components/workspace/contracts";
import { WorkspaceSelect } from "@/components/workspace/shared-ui";

type Role = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  _count: { users: number };
};

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  roleId: string | null;
  roleName: string | null;
  overrides: Array<{ permission: string; allow: boolean }>;
  effective: string[];
};

type RolesPayload = {
  roles: Role[];
  catalogue: PermissionGroup[];
  users: TeamMember[];
};

export function RolesView({ data, submit }: { data: WorkspaceData; submit: SubmitFn }) {
  const [payload, setPayload] = useState<RolesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);
  const [cloning, setCloning] = useState<Role | null>(null);
  const [editingUser, setEditingUser] = useState<TeamMember | null>(null);
  void data;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPayload(await queryWorkspace<RolesPayload>("/api/v1/operations/roles"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  function openRole(role: Role) {
    setEditingRole(role);
    setDraftPermissions([...role.permissions]);
  }

  function togglePermission(permission: string) {
    setDraftPermissions((current) => current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission]);
  }

  async function saveRole() {
    if (!editingRole) return;
    setBusy(true);
    const result = await submit("/api/v1/operations/roles", {
      kind: "role",
      id: editingRole.id,
      permissions: draftPermissions,
    }, "Role saved.", "PATCH", false);
    setBusy(false);
    if (result.ok) { setEditingRole(null); await load(); }
    else setError(result.error);
  }

  async function createClone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cloning) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const result = await submit("/api/v1/operations/roles", {
      name: String(form.get("name") || "").trim(),
      description: String(form.get("description") || "").trim() || null,
      cloneFromRoleId: cloning.id,
    }, "Role created.", "POST", false);
    setBusy(false);
    if (result.ok) { setCloning(null); await load(); }
    else setError(result.error);
  }

  async function saveUser(roleId: string | null, overrides: Array<{ permission: string; allow: boolean }>) {
    if (!editingUser) return;
    setBusy(true);
    const result = await submit("/api/v1/operations/roles", {
      kind: "user",
      id: editingUser.id,
      roleId,
      overrides,
    }, "Rights updated.", "PATCH", false);
    setBusy(false);
    if (result.ok) { setEditingUser(null); await load(); }
    else setError(result.error);
  }

  const roles = payload?.roles ?? [];
  const catalogue = payload?.catalogue ?? [];
  const users = payload?.users ?? [];

  return <div className="space-y-4">
    {error && <Banner tone="danger" icon={<AlertTriangle size={15} />} onDismiss={() => setError("")}>{error}</Banner>}

    <Card
      title="Roles"
      description="What each kind of person can do. Built-in roles are locked - copy one to make your own."
    >
      {loading ? <SkeletonTable rows={3} columns={3} /> : <div className="grid gap-3 md:grid-cols-2">
        {roles.map((role) => <div key={role.id} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-card)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[15px] font-medium text-[var(--text-primary)]">
                {role.isSystem ? <Lock size={13} className="shrink-0 text-[var(--text-muted)]" /> : <Shield size={13} className="shrink-0 text-[var(--accent)]" />}
                <span className="truncate">{role.name}</span>
              </p>
              <p className="mt-0.5 text-[13px] text-[var(--text-secondary)]">{role.description}</p>
            </div>
            <Badge tone={role._count.users ? "info" : "neutral"}>{role._count.users} {role._count.users === 1 ? "person" : "people"}</Badge>
          </div>

          <p className="mt-3 text-xs text-[var(--text-muted)]">{role.permissions.length} rights granted</p>

          <div className="mt-3 flex gap-2">
            {/* Built-in roles are locked on purpose: an owner who could edit "Owner" could remove
                their own right to manage roles and lock themselves out for good. */}
            <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => setCloning(role)}>Copy</Button>
            <Button size="sm" variant="ghost" onClick={() => openRole(role)}>
              {role.isSystem ? "View rights" : "Edit rights"}
            </Button>
          </div>
        </div>)}
      </div>}
    </Card>

    <Card title="Who has what" description="Give one person an extra right, or take one away, without changing their whole role.">
      {loading ? <SkeletonTable rows={4} columns={3} /> : users.length ? <div className="divide-y divide-[var(--border)]">
        {users.map((member) => {
          const added = member.overrides.filter((item) => item.allow);
          const removed = member.overrides.filter((item) => !item.allow);
          return <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-[var(--text-primary)]">{member.name}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
                {member.roleName ?? <span className="text-[var(--warning-text)]">No role assigned</span>}
                {added.length > 0 && <Badge tone="success">+{added.length} extra</Badge>}
                {removed.length > 0 && <Badge tone="danger">-{removed.length} removed</Badge>}
              </p>
            </div>
            <Button size="sm" variant="secondary" icon={<UserCog size={14} />} onClick={() => setEditingUser(member)}>Change rights</Button>
          </div>;
        })}
      </div> : <EmptyState icon={<UserCog size={18} />} title="No team members yet" description="Add staff and they will appear here." />}
    </Card>

    {editingRole && <Overlay
      title={editingRole.name}
      description={editingRole.isSystem
        ? "This is a built-in role and cannot be changed. Copy it to make one you can edit."
        : "Tick what someone with this role may do."}
      size="lg"
      onClose={() => setEditingRole(null)}
      footer={editingRole.isSystem
        ? <Button variant="secondary" icon={<Copy size={14} />} onClick={() => { setCloning(editingRole); setEditingRole(null); }}>Copy to edit</Button>
        : <>
          <Button variant="ghost" onClick={() => setEditingRole(null)}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={() => void saveRole()}>Save rights</Button>
        </>}
    >
      <PermissionPicker
        catalogue={catalogue}
        selected={draftPermissions}
        readOnly={editingRole.isSystem}
        onToggle={togglePermission}
      />
    </Overlay>}

    {cloning && <Overlay
      title={`Copy ${cloning.name}`}
      description="The new role starts with the same rights. Change them however you like."
      size="sm"
      onClose={() => setCloning(null)}
    >
      <form onSubmit={createClone} className="space-y-3">
        <Field label="Name"><Input name="name" required defaultValue={`${cloning.name} (copy)`} autoFocus /></Field>
        <Field label="Description" hint="What is this role for?"><Input name="description" defaultValue={cloning.description ?? ""} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={() => setCloning(null)}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>Create role</Button>
        </div>
      </form>
    </Overlay>}

    {editingUser && <UserRightsEditor
      member={editingUser}
      roles={roles}
      catalogue={catalogue}
      busy={busy}
      onSave={saveUser}
      onClose={() => setEditingUser(null)}
    />}
  </div>;
}

function PermissionPicker({ catalogue, selected, readOnly, onToggle }: {
  catalogue: PermissionGroup[];
  selected: string[];
  readOnly?: boolean;
  onToggle: (permission: string) => void;
}) {
  return <div className="space-y-5">
    {catalogue.map((group) => <div key={group.id}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{group.label}</p>
      <div className="space-y-1.5">
        {group.permissions.map((permission) => {
          const isOn = selected.includes(permission.id);
          return <label
            key={permission.id}
            className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border p-3 transition ${isOn ? "border-[var(--accent-soft-border)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--surface-card)]"} ${readOnly ? "cursor-default opacity-70" : "hover:border-[var(--border-strong)]"}`}
          >
            <input
              type="checkbox"
              checked={isOn}
              disabled={readOnly}
              onChange={() => onToggle(permission.id)}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium text-[var(--text-primary)]">
                {permission.label}
                {/* These are the rights that let money leave the salon, or let someone change what
                    everyone else can do. They are flagged rather than merely listed. */}
                {permission.sensitive && <Badge tone="warning">Sensitive</Badge>}
              </span>
              <span className="mt-0.5 block text-[13px] text-[var(--text-secondary)]">{permission.detail}</span>
            </span>
          </label>;
        })}
      </div>
    </div>)}
  </div>;
}

function UserRightsEditor({ member, roles, catalogue, busy, onSave, onClose }: {
  member: TeamMember;
  roles: Role[];
  catalogue: PermissionGroup[];
  busy: boolean;
  onSave: (roleId: string | null, overrides: Array<{ permission: string; allow: boolean }>) => void;
  onClose: () => void;
}) {
  const [roleId, setRoleId] = useState(member.roleId ?? "");
  const [overrides, setOverrides] = useState(member.overrides);

  const role = roles.find((item) => item.id === roleId);
  const rolePermissions = role?.permissions ?? [];

  /**
   * Three states per right, not two: it comes with the role, it has been added on top, or it has
   * been taken away. A simple checkbox could not say "she is a receptionist, but she may also give
   * refunds" - it would only look like a receptionist with an odd tick.
   */
  function stateOf(permission: string): "role" | "added" | "removed" | "none" {
    const override = overrides.find((item) => item.permission === permission);
    if (override) return override.allow ? "added" : "removed";
    return rolePermissions.includes(permission) ? "role" : "none";
  }

  function cycle(permission: string) {
    const state = stateOf(permission);
    const withoutThis = overrides.filter((item) => item.permission !== permission);
    const fromRole = rolePermissions.includes(permission);

    if (fromRole) {
      // Comes with the role -> take it away -> back to the role default.
      setOverrides(state === "removed" ? withoutThis : [...withoutThis, { permission, allow: false }]);
      return;
    }
    // Not in the role -> add it -> back to not having it.
    setOverrides(state === "added" ? withoutThis : [...withoutThis, { permission, allow: true }]);
  }

  return <Overlay
    title={member.name}
    description="Pick a role, then adjust individual rights if this person is an exception."
    size="lg"
    onClose={onClose}
    footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="primary" loading={busy} onClick={() => onSave(roleId || null, overrides)}>Save</Button>
    </>}
  >
    <div className="space-y-5">
      <WorkspaceSelect
        label="Role"
        value={roleId}
        onChange={(value) => { setRoleId(value); setOverrides([]); }}
        options={[{ value: "", label: "No role" }, ...roles.map((item) => ({ value: item.id, label: item.name, description: item.description ?? undefined }))]}
      />

      {overrides.length > 0 && <Banner tone="info">
        {member.name} is a {role?.name ?? "team member"}, with {overrides.filter((item) => item.allow).length} right(s) added and {overrides.filter((item) => !item.allow).length} taken away.
      </Banner>}

      <div className="space-y-5">
        {catalogue.map((group) => <div key={group.id}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">{group.label}</p>
          <div className="space-y-1.5">
            {group.permissions.map((permission) => {
              const state = stateOf(permission.id);
              const granted = state === "role" || state === "added";
              return <button
                key={permission.id}
                type="button"
                onClick={() => cycle(permission.id)}
                className={`flex w-full items-start gap-3 rounded-[var(--radius-sm)] border p-3 text-left transition ${
                  state === "added" ? "border-[var(--success)] bg-[var(--success-soft)]"
                    : state === "removed" ? "border-[var(--danger)] bg-[var(--danger-soft)]"
                      : state === "role" ? "border-[var(--accent-soft-border)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-[var(--surface-card)] hover:border-[var(--border-strong)]"
                }`}
              >
                <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded border text-[10px] ${granted ? "border-transparent bg-[var(--accent)] text-[var(--text-on-accent)]" : "border-[var(--border-strong)]"}`}>
                  {granted ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium text-[var(--text-primary)]">
                    {permission.label}
                    {permission.sensitive && <Badge tone="warning">Sensitive</Badge>}
                    {state === "added" && <Badge tone="success">Added for {member.name.split(" ")[0]}</Badge>}
                    {state === "removed" && <Badge tone="danger">Taken away</Badge>}
                  </span>
                  <span className="mt-0.5 block text-[13px] text-[var(--text-secondary)]">{permission.detail}</span>
                </span>
              </button>;
            })}
          </div>
        </div>)}
      </div>
    </div>
  </Overlay>;
}
