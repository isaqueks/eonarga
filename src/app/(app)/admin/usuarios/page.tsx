import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { sql } from "drizzle-orm";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { reviews, users } from "@/lib/db/schema";

import { CreateUserDialog } from "./create-user-dialog";
import { UserRowActions } from "./user-row-actions";

export const metadata: Metadata = { title: "Usuários" };

function ultimoLogin(iso: string | null) {
  if (!iso) return "nunca";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "nunca";
  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
}

export default async function AdminUsuariosPage() {
  const { user: me } = await requireAdmin();

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      gender: users.gender,
      testosterone: users.testosterone,
      reviewCount: sql<number>`(
        select count(*) from ${reviews} where ${reviews.userId} = ${users.id}
      )`.as("review_count"),
    })
    .from(users)
    .orderBy(users.name);

  const admins = rows.filter((r) => r.role === "admin" && r.isActive).length;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {rows.length} {rows.length === 1 ? "pessoa" : "pessoas"} no grupo
        </p>
        <CreateUserDialog />
      </div>

      <div className="border-border overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead>Gênero</TableHead>
              <TableHead className="text-right">Testo</TableHead>
              <TableHead>Último login</TableHead>
              <TableHead className="text-right">Avaliações</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} className={row.isActive ? undefined : "opacity-60"}>
                <TableCell className="font-medium whitespace-nowrap">
                  {row.name}
                  {row.id === me.id ? (
                    <span className="text-muted-foreground text-xs"> (você)</span>
                  ) : null}
                  {row.mustChangePassword ? (
                    <span className="text-muted-foreground block text-xs">senha temporária</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {row.email}
                </TableCell>
                <TableCell>
                  <Badge variant={row.role === "admin" ? "default" : "secondary"}>
                    {row.role === "admin" ? "admin" : "membro"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={row.isActive ? "outline" : "destructive"}>
                    {row.isActive ? "sim" : "não"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {row.gender ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {row.testosterone ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {ultimoLogin(row.lastLoginAt)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.reviewCount}</TableCell>
                <TableCell className="text-right">
                  <UserRowActions
                    userId={row.id}
                    name={row.name}
                    role={row.role}
                    isActive={row.isActive}
                    isSelf={row.id === me.id}
                    isLastAdmin={row.role === "admin" && row.isActive && admins <= 1}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
