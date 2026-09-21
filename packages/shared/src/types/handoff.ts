export interface HandoffSummary {
  reason: string;
  customerId: string | null;
  contractId: string | null;
  intent: string;
  reportedProblem: string;
  toolsConsulted: Array<{ tool: string; result: string }>;
  actionsTaken: string[];
  actionsFailed: string[];
  suggestedNextAction: string;
}
