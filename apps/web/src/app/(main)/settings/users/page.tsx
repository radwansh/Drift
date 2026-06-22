"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserInviteDialog } from "@/components/settings/user-invite-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Plus, Trash2, UserCheck, Shield, Eye } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "viewer";
  status: "active" | "invited" | "inactive";
  joined: string;
}

const mockTeamMembers: TeamMember[] = [
  { id: "u1", name: "You", email: "admin@acme.com", role: "admin", status: "active", joined: "Jan 15, 2025" },
  { id: "u2", name: "Sarah Chen", email: "sarah@acme.com", role: "manager", status: "active", joined: "Mar 03, 2025" },
  { id: "u3", name: "Mike Ross", email: "mike@acme.com", role: "viewer", status: "active", joined: "Apr 12, 2025" },
  { id: "u4", name: "Lisa Park", email: "lisa@acme.com", role: "viewer", status: "invited", joined: "—" },
];

const roleIcons: Record<string, React.ReactNode> = {
  admin: <Shield className="h-4 w-4" />,
  manager: <UserCheck className="h-4 w-4" />,
  viewer: <Eye className="h-4 w-4" />,
};

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">User Management</h2>
          <p className="text-muted-foreground mt-1">Manage team members and their access</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Invite User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {member.name}
                      {member.id === "u1" && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">You</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-sm">
                      {roleIcons[member.role]}
                      <span className="capitalize">{member.role}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.status === "active" ? "success" : member.status === "invited" ? "info" : "secondary"}>
                      {member.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{member.joined}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(member)}
                      disabled={member.id === "u1"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <UserInviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={handleInvite}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Remove User"
        description={`Are you sure you want to remove ${deleteTarget?.name}? They will lose access to all company data.`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemove}
      />
    </div>
  );
}
