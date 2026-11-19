export interface SearchableAgent {
  name?: string;
  role?: string;
  task?: string;
}
export declare function filterAgents<T extends SearchableAgent>(agents: T[], query?: string): T[];
