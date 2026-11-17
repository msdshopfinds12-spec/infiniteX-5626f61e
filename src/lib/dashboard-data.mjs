export function filterAgents(agents, query = "") {
  if (!Array.isArray(agents)) return [];
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  if (!normalizedQuery) return agents;
  return agents.filter((agent) => {
    const searchableText = [agent?.name, agent?.role, agent?.task]
      .filter((value) => typeof value === "string")
      .join(" ")
      .toLocaleLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}
