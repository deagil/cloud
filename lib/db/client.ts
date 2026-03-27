/**
 * @deprecated Migration stub — all imports of `db` from this file will fail at runtime.
 * Migrate to lib/supabase/server.ts or lib/supabase/admin.ts.
 * This stub compiles without errors so migration can happen route by route (Phase 2).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = new Proxy(
  {},
  {
    get() {
      throw new Error(
        '[Migration] lib/db/client.ts is removed. Use lib/supabase/server.ts or lib/supabase/admin.ts instead.',
      )
    },
  },
)
