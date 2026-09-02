export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="border-border bg-card w-full max-w-sm rounded-2xl border p-6 shadow-lg">
        {children}
      </div>
    </main>
  );
}
