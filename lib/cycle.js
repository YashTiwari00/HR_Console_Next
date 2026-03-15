function getDateFromInput(input) {
  if (!input) return new Date();
  if (input instanceof Date) return input;

  const parsed = new Date(input);
  if (Number.isNaN(parsed.valueOf())) {
    return new Date();
  }

  return parsed;
}

export function toCycleIdFromDate(input) {
  const date = getDateFromInput(input);
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const quarter = Math.floor(monthIndex / 3) + 1;
  return `Q${quarter}-${year}`;
}

export function normalizeCycleId(input, fallbackDateInput) {
  const value = String(input || "").trim().toUpperCase();
  const match = value.match(/^Q([1-4])-(\d{4})$/);

  if (match) {
    return `Q${match[1]}-${match[2]}`;
  }

  return toCycleIdFromDate(fallbackDateInput);
}

export function buildCheckInCode(checkIn) {
  const cycleId = toCycleIdFromDate(checkIn?.scheduledAt || checkIn?.$createdAt);
  const id = String(checkIn?.$id || "");
  const suffix = id ? id.slice(-6).toUpperCase() : "UNSET00";
  return `CI-${cycleId}-${suffix}`;
}
