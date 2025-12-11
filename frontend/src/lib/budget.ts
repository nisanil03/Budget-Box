import { BudgetFields } from "@/store/budgetStore";

export const formatCurrency = (value: number) =>
  value.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });

export const getTotals = (budget: BudgetFields) => {
  const expenses =
    budget.monthlyBills +
    budget.food +
    budget.transport +
    budget.subscriptions +
    budget.miscellaneous;
  const burnRate = budget.income ? expenses / budget.income : 0;
  const savings = budget.income - expenses;
  const monthEndPrediction = savings;
  return { expenses, burnRate, savings, monthEndPrediction };
};

export const getWarnings = (budget: BudgetFields) => {
  const { burnRate, savings } = getTotals(budget);
  const warnings: string[] = [];
  if (budget.income > 0 && budget.food / budget.income > 0.4) {
    warnings.push("Food spend is above 40% of income — trim dining/groceries.");
  }
  if (budget.income > 0 && budget.subscriptions / budget.income > 0.3) {
    warnings.push("Subscriptions exceed 30% of income — cancel unused apps.");
  }
  if (savings < 0) {
    warnings.push("Your expenses are higher than income — cut variable costs.");
  }
  if (burnRate > 1) {
    warnings.push("Burn rate is above 1.0 — you will run out before month-end.");
  }
  return warnings;
};

