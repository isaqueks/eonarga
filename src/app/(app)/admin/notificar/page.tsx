import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { countPushAudience, isPushEnabled } from "@/lib/push";
import { listRecentNotifications } from "@/lib/queries/notifications";
import { relativeFromNow } from "@/lib/dates";

import { NotifyForm } from "./notify-form";

export const metadata: Metadata = { title: "Notificar" };

export const dynamic = "force-dynamic";

export default async function AdminNotificarPage() {
  await requireAdmin();

  const enabled = isPushEnabled();
  const [people, audience, log] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.name)),
    countPushAudience(),
    listRecentNotifications(20),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-base">Mandar um aviso</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Vai como notificação no celular de quem ativou. {audience.people}{" "}
            {audience.people === 1 ? "pessoa ativou" : "pessoas ativaram"}, em {audience.devices}{" "}
            {audience.devices === 1 ? "aparelho" : "aparelhos"}.
          </p>
        </div>

        {enabled ? (
          <NotifyForm people={people} />
        ) : (
          <p
            role="alert"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm"
          >
            Push não está configurado no servidor. Falta <code>VAPID_PUBLIC_KEY</code>,{" "}
            <code>VAPID_PRIVATE_KEY</code> ou <code>VAPID_SUBJECT</code> no <code>.env</code>.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-base">Últimos disparos</h2>

        {log.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nada foi disparado ainda.</p>
        ) : (
          <ul className="border-border divide-border divide-y rounded-xl border">
            {log.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 p-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-narga text-xs font-semibold uppercase">
                    {item.kind === "call"
                      ? "chamada"
                      : item.kind === "comment"
                        ? "comentário"
                        : "aviso"}
                  </span>
                  <span className="text-sm font-medium">{item.title}</span>
                </div>
                <p className="text-sm text-pretty">{item.body}</p>
                <p className="text-muted-foreground text-xs">
                  {item.author} → {item.target ?? "todo mundo"}
                  {item.placeName ? ` · ${item.placeName}` : ""} · {item.sentCount}{" "}
                  {item.sentCount === 1 ? "aparelho" : "aparelhos"} ·{" "}
                  <time dateTime={item.createdAt}>{relativeFromNow(item.createdAt)}</time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
