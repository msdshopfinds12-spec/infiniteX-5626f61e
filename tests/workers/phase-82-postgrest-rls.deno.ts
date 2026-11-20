function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error("Missing Phase 82 environment value: " + name);
  return value;
}

async function rest(jwt: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch("http://127.0.0.1:3000/" + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

Deno.test({
  name: "Phase 82: PostgREST enforces owner isolation and least-privilege columns for two tenants",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const tokenA = required("PHASE81_USER_JWT");
    const tokenB = required("PHASE81_USER_B_JWT");
    const ownerA = required("PHASE81_USER_ID");
    const ownerB = required("PHASE81_USER_B_ID");
    const projectA = "82000000-4000-4000-8000-000000000001";
    const projectB = "82000000-4000-4000-8000-000000000002";

    // Both authenticated subjects can see exactly their own project row.
    const aProjectsResponse = await rest(tokenA, "user_projects?select=id,user_id,title");
    const bProjectsResponse = await rest(tokenB, "user_projects?select=id,user_id,title");
    assert(aProjectsResponse.status === 200, "tenant A project read must succeed");
    assert(bProjectsResponse.status === 200, "tenant B project read must succeed");
    const aProjects = await aProjectsResponse.json();
    const bProjects = await bProjectsResponse.json();
    assert(aProjects.length === 1 && aProjects[0].id === projectA && aProjects[0].user_id === ownerA, "tenant A must see only its own project");
    assert(bProjects.length === 1 && bProjects[0].id === projectB && bProjects[0].user_id === ownerB, "tenant B must see only its own project");

    // A row-level UPDATE against the other tenant must affect zero rows.
    const crossTenantUpdate = await rest(tokenA, "user_projects?id=eq." + projectB, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ title: "forged-by-A" }),
    });
    assert(crossTenantUpdate.ok, "cross-tenant filtered update should not reveal row existence via error");
    const changedRows = await crossTenantUpdate.json();
    assert(Array.isArray(changedRows) && changedRows.length === 0, "tenant A must not update tenant B project");

    // WITH CHECK must reject a forged owner_id on INSERT.
    const forgedInsert = await rest(tokenA, "user_projects", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: ownerB,
        title: "forged tenant project",
        project_type: "general",
        content: {},
      }),
    });
    assert(forgedInsert.status === 403, "forged cross-tenant INSERT must be denied with 403; got " + forgedInsert.status);

    // The API-key list may expose metadata, but never the stored hash.
    const keyMetadata = await rest(tokenA, "platform_api_keys?select=id,owner_id,label,key_prefix,scopes,expires_at,last_used_at,revoked_at,created_at");
    assert(keyMetadata.status === 200, "safe API-key metadata projection must succeed");
    const keys = await keyMetadata.json();
    assert(keys.length === 1 && keys[0].owner_id === ownerA && keys[0].label === "Phase 82 synthetic A", "tenant A must see only its own API-key metadata");
    const secretColumn = await rest(tokenA, "platform_api_keys?select=key_hash");
    assert(secretColumn.status === 400, "authenticated client must not select key_hash; got " + secretColumn.status);

    // User A cannot select User B's profile or workflow queue row.
    const profileB = await rest(tokenA, "profiles?select=id&id=eq." + ownerB);
    assert(profileB.status === 200 && (await profileB.json()).length === 0, "tenant A must not read tenant B profile");
    const runsB = await rest(tokenA, "workflow_runs?select=id,owner_id,status&id=eq.81000000-3000-4000-8000-000000000002");
    assert(runsB.status === 200 && (await runsB.json()).length === 0, "tenant A must not read tenant B workflow run");

    // The second identity is independently checked against the first tenant.
    const projectsAFromB = await rest(tokenB, "user_projects?select=id&id=eq." + projectA);
    assert(projectsAFromB.status === 200 && (await projectsAFromB.json()).length === 0, "tenant B must not read tenant A project");

    // Ensure no mutation in this test changed either seeded tenant fixture.
    const finalA = await rest(tokenA, "user_projects?select=id,title&id=eq." + projectA);
    const finalB = await rest(tokenB, "user_projects?select=id,title&id=eq." + projectB);
    assert((await finalA.json())[0]?.title === "Phase 82 tenant A project", "tenant A fixture must remain unchanged");
    assert((await finalB.json())[0]?.title === "Phase 82 tenant B project", "tenant B fixture must remain unchanged");
  },
});
