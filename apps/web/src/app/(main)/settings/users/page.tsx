"use client";

import { useState } from "react";
import { Badge, Button, Icon, Notice, PageHeader, Panel, PanelBar } from "@/components/cv";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserInviteDialog } from "@/components/settings/user-invite-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EDITOR_ROLES, PAY_DETAIL_ROLES } from "@/lib/roles";

/**
 * Settings · Users — board "Settings: users", screen 8 of the Ink & Signal
 * rebuild.
 *
 * The list, the invite dialog and the remove confirmation are unchanged, and so
 * is the thing worth saying out loud: **the four people below are a fixture.**
 * `mockTeamMembers` is a literal array, Invite pushes onto `useState` and
 * Remove splices it. There is no `users` router, nothing reads
 * `users` for this screen, and a reload restores all four. The rebuild is
 * presentation only.
 *
 * Two things the board asks for are not here. **Resend invite** would be a
 * second action in the row, and nothing sends the first invitation either, so
 * it would be a button that does nothing to a person who is waiting for an
 * email. And the row count is "4 users", not a role summary — there is no query
 * to count anything against.
 *
 * The role matrix underneath is drawn from `EDITOR_ROLES` and
 * `PAY_DETAIL_ROLES`, the same two arrays `editorProcedure` and
 * `payDetailProcedure` enforce, so it cannot drift from what the server allows.
 * It reads "what each role can do" rather than "what each role can see", and
 * the note beneath it says why: `comparisons.getById` is a `memberProcedure`,
 * so the Dashboard and the Detailed View put every employee's name, gross and
 * net in front of a viewer. A matrix that implied otherwise would be the most
 * dangerous sentence on this screen.
 */

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "viewer";
  status: "active" | "invited" | "inactive";
  joined: string;
}

const mockTeamMembers: TeamMember[] = [
  {
    id: "u1",
    name: "You",
    email: "admin@acme.com",
    role: "admin",
    status: "active",
    joined: "Jan 15, 2025",
  },
  {
    id: "u2",
    name: "Sarah Chen",
    email: "sarah@acme.com",
    role: "manager",
    status: "active",
    joined: "Mar 03, 2025",
  },
  {
    id: "u3",
    name: "Mike Ross",
    email: "mike@acme.com",
    role: "viewer",
    status: "active",
    joined: "Apr 12, 2025",
  },
  {
    id: "u4",
    name: "Lisa Park",
    email: "lisa@acme.com",
    role: "viewer",
    status: "invited",
    joined: "—",
  },
];

const ROLE_LABELS: Record<TeamMember["role"], string> = {
  admin: "Admin",
  manager: "Manager",
  viewer: "Viewer",
};

/** The three roles, in the order the invite dialog offers them. */
const ROLES = ["admin", "manager", "viewer"] as const;

/**
 * One capability per row, each tied to the procedure that decides it, in order:
 * `comparisons.*` and `annual.getSummary` (member), `exports.*` (member),
 * `employeeFile.*` (pay detail), `payrollPeriods.ingest` and `.delete` (editor),
 * `annual.setComponentCategories`, `.setBudget` and `.setFiscalStartMonth`
 * (editor). A row with no `roles` is open to every signed-in member.
 *
 * No row makes a claim about the AI endpoints: `ai.*` is `protectedProcedure`,
 * which is neither of the two role sets, so it is left out rather than guessed.
 */
const ROLE_MATRIX: { what: string; roles?: readonly string[] }[] = [
  { what: "See the Dashboard, Detailed View and Annual salaries" },
  { what: "Export a comparison or the annual pack" },
  { what: "Open an Employee File", roles: PAY_DETAIL_ROLES },
  { what: "Add a payroll period, and delete one", roles: EDITOR_ROLES },
  { what: "Set categories, the annual budget and the fiscal year", roles: EDITOR_ROLES },
];

export default function UsersPage() {
  const [members, setMembers] = useState<TeamMember[]>(mockTeamMembers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);

  const handleInvite = (name: string, email: string, role: string) => {
    const newMember: TeamMember = {
      id: `u${Date.now()}`,
      name,
      email,
      role: role as TeamMember["role"],
      status: "invited",
      joined: "—",
    };
    setMembers((prev) => [...prev, newMember]);
  };

  const handleRemove = () => {
    if (!deleteTarget) return;
    setMembers((prev) => prev.filter((m) => m.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Settings"
        title="Users"
        lede="Who can sign in to this company, and what their role lets them do."
        actions={
          <Button iconLeft="users" onClick={() => setInviteOpen(true)}>
            Invite a user
          </Button>
        }
      />

      <SettingsTabs />

      <Panel flush>
        <PanelBar>
          <p className="m-0 text-[13px] leading-[18px] text-cv-ink-muted">
            {members.length} user{members.length === 1 ? "" : "s"}
          </p>
        </PanelBar>

        <div className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  {/* Name over email, as the board sets it: one cell per person,
                      rather than a name column the eye has to pair with an
                      email column two cells away. */}
                  <TableCell>
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-2 text-sm font-semibold leading-5 text-cv-ink">
                        {member.name}
                        {member.id === "u1" && <Badge tone="neutral">You</Badge>}
                      </span>
                      <span className="truncate text-xs leading-4 text-cv-ink-subtle">
                        {member.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-cv-ink">{ROLE_LABELS[member.role]}</TableCell>
                  <TableCell>
                    <MemberStatus status={member.status} />
                  </TableCell>
                  <TableCell className="text-cv-ink-muted">{member.joined}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${member.name}`}
                        onClick={() => setDeleteTarget(member)}
                        disabled={member.id === "u1"}
                      >
                        Remove
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel
        title="What each role can do"
        description="Admin and Manager allow the same things today; they are separate roles so that changing one later does not change the other."
      >
        <div className="overflow-x-auto">
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Capability</TableHead>
                {ROLES.map((role) => (
                  <TableHead key={role} className="w-28 text-center">
                    {ROLE_LABELS[role]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROLE_MATRIX.map((row) => (
                <TableRow key={row.what}>
                  <TableCell className="text-cv-ink">{row.what}</TableCell>
                  {ROLES.map((role) => {
                    const allowed = !row.roles || row.roles.includes(role);
                    return (
                      <TableCell key={role} className="text-center">
                        {allowed ? (
                          <>
                            <Icon
                              name="check"
                              size={16}
                              className="inline-block text-cv-success-ink"
                            />
                            <span className="sr-only">Yes</span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true" className="text-cv-ink-subtle">
                              –
                            </span>
                            <span className="sr-only">No</span>
                          </>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Notice tone="info" className="mt-4" title="A viewer still sees individual pay">
          The Dashboard and the Detailed View list every employee by name with their gross, net and
          per-component changes, and both are open to any signed-in member. Only the Employee File
          is narrowed by role.
        </Notice>
      </Panel>

      <UserInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onInvite={handleInvite} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={deleteTarget ? `Remove ${deleteTarget.name}?` : "Remove this user?"}
        description="They lose access to every payroll period, comparison and employee record in this company."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemove}
      />
    </div>
  );
}

/** Active is a success; invited and inactive are facts, not problems. */
function MemberStatus({ status }: { status: TeamMember["status"] }) {
  if (status === "active") {
    return (
      <Badge tone="success" icon="check">
        Active
      </Badge>
    );
  }
  if (status === "invited") {
    return (
      <Badge tone="neutral" icon="mail">
        Invited
      </Badge>
    );
  }
  return <Badge tone="neutral">Inactive</Badge>;
}
