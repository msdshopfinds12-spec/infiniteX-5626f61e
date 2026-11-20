import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import type { AuthSessionAdapter } from "./auth-session-provider.tsx";

/**
 * Exposes only the stable user ID to the provider-neutral session layer.
 * Access tokens, refresh tokens, and raw SDK session objects never enter
 * React application state.
 */
export function createSupabaseAuthSessionAdapter(
  client: Pick<SupabaseClient<Database>, "auth">,
): AuthSessionAdapter {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      const userId = data.session?.user.id;
      return userId ? { user: { id: userId } } : null;
    },

    onAuthStateChange(listener) {
      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((_event, session) => {
        const userId = session?.user.id;
        listener(userId ? { user: { id: userId } } : null);
      });

      return () => subscription.unsubscribe();
    },
  };
}
