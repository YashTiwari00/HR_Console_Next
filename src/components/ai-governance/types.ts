import type { HrAiGovernanceOverview } from "@/app/employee/_lib/pmsClient";

export type FeatureRow = HrAiGovernanceOverview["totalsByFeature"][number];
export type UserRow = HrAiGovernanceOverview["topUsers"][number];
export type NearLimitRow = NonNullable<HrAiGovernanceOverview["nearLimitUsers"]>[number];
export type TopSpenderRow = NonNullable<HrAiGovernanceOverview["topSpenders"]>[number];
export type NearBudgetRow = NonNullable<HrAiGovernanceOverview["nearBudgetUsers"]>[number];
export type OverBudgetRow = NonNullable<HrAiGovernanceOverview["overBudgetUsers"]>[number];
