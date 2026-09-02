import { requireAdmin } from "@/lib/auth/guards";

import { AdminSubNav } from "./admin-sub-nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-3 p-4 pb-0">
        <h1 className="font-display text-xl">Administração</h1>
        <AdminSubNav />
      </div>
      {children}
    </div>
  );
}
