export const LEADERSHIP_METRIC_DEFINITIONS = Object.freeze([
  {
    key: "employees",
    label: "Employees",
    description: "Total employee population included in strategic scope.",
    category: "coverage",
  },
  {
    key: "managers",
    label: "Managers",
    description: "Total manager population included in strategic scope.",
    category: "coverage",
  },
  {
    key: "activeGoals",
    label: "Active Goals",
    description: "Goals currently open for execution and review.",
    category: "coverage",
  },
  {
    key: "avgProgressPercent",
    label: "Average Goal Progress",
    description: "Average progress across active goals.",
    category: "quality",
  },
  {
    key: "checkInCompletionRate",
    label: "Check-in Completion Rate",
    description: "Completed check-ins divided by completed plus planned check-ins.",
    category: "quality",
  },
  {
    key: "atRiskGoals",
    label: "At-Risk Goals",
    description: "Goals with behind status signals or low progress.",
    category: "risk",
  },
]);

export function listLeadershipMetricDefinitions() {
  return LEADERSHIP_METRIC_DEFINITIONS.map((item) => ({ ...item }));
}
