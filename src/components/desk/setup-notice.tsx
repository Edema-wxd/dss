export function DeskSetupNotice() {
  return (
    <main className="mx-auto grid max-w-xl gap-3 px-5 py-20 text-center">
      <h1 className="text-3xl font-bold tracking-[-0.03em]">The desk isn&apos;t connected yet</h1>
      <p className="text-slate">
        Set <code className="rounded bg-paper px-1">DATABASE_URL</code> to the Neon connection string in <code className="rounded bg-paper px-1">.env.local</code>, or
        in your host&apos;s environment settings, then reload.
      </p>
    </main>
  );
}
