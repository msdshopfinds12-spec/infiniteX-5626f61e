import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { createSupabaseAuthSessionAdapter } from "./supabase-auth-session-adapter.ts";

type SyntheticSession = { user: { id: string } };
type Listener = (event: string, session: SyntheticSession | null) => void;

function fakeClient(options?: {
  session?: SyntheticSession | null;
  error?: Error;
}) {
  let listener: Listener | undefined;
  let unsubscribed = false;

  const client = {
    auth: {
      getSession: async () => ({
        data: { session: options?.session ?? null },
        error: options?.error ?? null,
      }),
      onAuthStateChange: (callback: Listener) => {
        listener = callback;
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                unsubscribed = true;
              },
            },
          },
        };
      },
    },
  } as unknown as Pick<SupabaseClient<Database>, "auth">;

  return {
    client,
    emit: (session: SyntheticSession | null) => listener?.("SIGNED_IN", session),
    isUnsubscribed: () => unsubscribed,
  };
}

test("maps an SDK session to the provider's minimal identity contract", async () => {
  const fake = fakeClient({ session: { user: { id: "synthetic-user-a" } } });
  const adapter = createSupabaseAuthSessionAdapter(fake.client);

  assert.deepEqual(await adapter.getSession(), {
    user: { id: "synthetic-user-a" },
  });
});

test("maps a missing SDK session to anonymous", async () => {
  const adapter = createSupabaseAuthSessionAdapter(fakeClient().client);
  assert.equal(await adapter.getSession(), null);
});

test("propagates session read errors without logging or masking them", async () => {
  const adapter = createSupabaseAuthSessionAdapter(
    fakeClient({ error: new Error("synthetic session failure") }).client,
  );

  await assert.rejects(adapter.getSession(), /synthetic session failure/);
});

test("maps auth events and unsubscribes the SDK listener", () => {
  const fake = fakeClient();
  const adapter = createSupabaseAuthSessionAdapter(fake.client);
  const received: unknown[] = [];
  const unsubscribe = adapter.onAuthStateChange((session) => received.push(session));

  fake.emit({ user: { id: "synthetic-user-b" } });
  fake.emit(null);
  unsubscribe();

  assert.deepEqual(received, [
    { user: { id: "synthetic-user-b" } },
    null,
  ]);
  assert.equal(fake.isUnsubscribed(), true);
});
