"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { UserProfile } from "@/types";
import { AccessChips } from "@/components/admin/access-chips";
import { RoleBadge } from "@/components/admin/role-badge";
import { memberAccessLabels, memberMatchesAccessFilter } from "@/lib/member-access";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
} from "lucide-react";

const PAGE_SIZE = 25;

type SortKey = "name" | "role" | "tokens" | "status" | "joined";

function joinedMs(value: unknown): number {
  if (!value) return 0;
  try {
    const createdAt = value as { seconds?: number; _seconds?: number };
    if (typeof createdAt === "object") {
      if (typeof createdAt.seconds === "number") return createdAt.seconds * 1000;
      if (typeof createdAt._seconds === "number") return createdAt._seconds * 1000;
    }
    const date = new Date(value as string | number | Date);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  } catch {
    return 0;
  }
}

function joinedDate(value: unknown): string {
  const ms = joinedMs(value);
  return ms ? new Date(ms).toLocaleDateString() : "N/A";
}

function lastNameOf(row: UserProfile) {
  return String(row.lastName ?? "").trim().toLowerCase();
}

function firstNameOf(row: UserProfile) {
  return String(row.firstName ?? "").trim().toLowerCase();
}

export default function AdminMembersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (authLoading) return;
    const fetchUsers = async () => {
      try {
        const token = await user?.getIdToken();
        const res = await fetch("/api/admin/users", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) setUsers(await res.json());
      } catch (error) {
        console.error("Failed to fetch users", error);
      } finally {
        setLoading(false);
      }
    };
    void fetchUsers();
  }, [user, authLoading]);

  useEffect(() => {
    setPage(1);
  }, [query, roleFilter, statusFilter, accessFilter, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((row) => {
      if (roleFilter !== "all" && row.role !== roleFilter) return false;
      if (statusFilter === "active" && row.isActive === false) return false;
      if (statusFilter === "disabled" && row.isActive !== false) return false;
      if (!memberMatchesAccessFilter(memberAccessLabels(row), accessFilter)) return false;
      if (!q) return true;
      const name = `${row.firstName ?? ""} ${row.lastName ?? ""}`.toLowerCase();
      return name.includes(q) || String(row.email ?? "").toLowerCase().includes(q);
    });
  }, [users, query, roleFilter, statusFilter, accessFilter]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = lastNameOf(a).localeCompare(lastNameOf(b)) || firstNameOf(a).localeCompare(firstNameOf(b));
      } else if (sortKey === "role") {
        cmp = String(a.role ?? "").localeCompare(String(b.role ?? ""));
      } else if (sortKey === "tokens") {
        cmp = (a.tokenBalance ?? 0) - (b.tokenBalance ?? 0);
      } else if (sortKey === "status") {
        const as = a.isActive === false ? 1 : 0;
        const bs = b.isActive === false ? 1 : 0;
        cmp = as - bs;
      } else {
        cmp = joinedMs(a.createdAt) - joinedMs(b.createdAt);
      }
      if (cmp !== 0) return cmp * dir;
      return lastNameOf(a).localeCompare(lastNameOf(b));
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "joined" || key === "tokens" ? "desc" : "asc");
    }
  };

  const SortHead = ({
    label,
    column,
    className,
  }: {
    label: string;
    column: SortKey;
    className?: string;
  }) => {
    const active = sortKey === column;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => toggleSort(column)}
          className="inline-flex items-center gap-1 font-medium hover:text-foreground"
        >
          {label}
          <Icon className="h-3.5 w-3.5 opacity-70" />
        </button>
      </TableHead>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading members...
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Members</h1>
          <p className="text-sm text-muted-foreground">
            Sorted by last name. Use filters to narrow the list.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {sorted.length} member{sorted.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email"
          className="w-full sm:max-w-xs"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="MEMBER">Member</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
          </SelectContent>
        </Select>
        <Select value={accessFilter} onValueChange={setAccessFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Access" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All access</SelectItem>
            <SelectItem value="fantasy">Fantasy</SelectItem>
            <SelectItem value="tracker">Tracker</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 md:hidden">
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort: Name</SelectItem>
            <SelectItem value="role">Sort: Role</SelectItem>
            <SelectItem value="tokens">Sort: Tokens</SelectItem>
            <SelectItem value="status">Sort: Status</SelectItem>
            <SelectItem value="joined">Sort: Joined</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
        >
          {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        </Button>
      </div>

      <div className="space-y-3 md:hidden">
        {pageRows.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-center text-sm text-muted-foreground">
            No members match these filters.
          </p>
        ) : (
          pageRows.map((row) => (
            <Link
              key={row.uid}
              href={`/admin/members/${row.uid}`}
              className="block space-y-3 rounded-lg border bg-card p-3 hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="break-words font-medium">
                    {row.lastName || "—"}
                    {row.firstName ? `, ${row.firstName}` : ""}
                  </div>
                  <div className="break-all text-xs text-muted-foreground">{row.email}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">Joined {joinedDate(row.createdAt)}</span>
                  <Badge variant={row.isActive === false ? "destructive" : "outline"}>
                    {row.isActive === false ? "Disabled" : "Active"}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <RoleBadge role={row.role} />
                  <AccessChips labels={memberAccessLabels(row)} />
                </div>
                <span className="shrink-0 text-lg font-bold">
                  {typeof row.tokenBalance === "number" ? row.tokenBalance : 0} Tokens
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-md border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="Member" column="name" />
              <SortHead label="Role" column="role" />
              <TableHead>Access</TableHead>
              <SortHead label="Tokens" column="tokens" />
              <SortHead label="Status" column="status" />
              <SortHead label="Joined" column="joined" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No members match these filters.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow
                  key={row.uid}
                  className="cursor-pointer"
                  onClick={() => router.push(`/admin/members/${row.uid}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/admin/members/${row.uid}`);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {row.lastName || "—"}
                        {row.firstName ? `, ${row.firstName}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">{row.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RoleBadge role={row.role} />
                  </TableCell>
                  <TableCell>
                    <AccessChips labels={memberAccessLabels(row)} />
                  </TableCell>
                  <TableCell>{typeof row.tokenBalance === "number" ? row.tokenBalance : 0}</TableCell>
                  <TableCell>
                    <Badge variant={row.isActive === false ? "destructive" : "outline"}>
                      {row.isActive === false ? "Disabled" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell>{joinedDate(row.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          Page {safePage} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
