export type ActionKind =
  | "inspect"
  | "plan"
  | "propose"
  | "write"
  | "merge"
  | "deploy"
  | "secrets"
  | "migration"
  | "billing";

const approvalRequiredActions = new Set<ActionKind>([
  "write", "merge", "deploy", "secrets", "migration", "billing",
]);

export function requiresHumanApproval(action: ActionKind): boolean {
  return approvalRequiredActions.has(action);
}

export function canExecuteRemoteAction(): false {
  return false;
}

export function getExecutionMode(): "local-demo" {
  return "local-demo";
}
