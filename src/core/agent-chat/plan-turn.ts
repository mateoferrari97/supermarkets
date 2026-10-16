export type PlanTurn = { searches: number; overBudgetReturned: boolean };

export const newPlanTurn = (): PlanTurn => ({ searches: 0, overBudgetReturned: false });
