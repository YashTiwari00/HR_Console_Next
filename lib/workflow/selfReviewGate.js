import { SELF_REVIEW_STATUSES } from "@/lib/appwriteSchema";

function normalizeText(value) {
  return String(value || "").trim();
}

function toTimestamp(value) {
  if (!value) return NaN;
  const time = new Date(String(value)).valueOf();
  return Number.isNaN(time) ? NaN : time;
}

function firstValidIso(cycle, keys) {
  for (const key of keys) {
    const candidate = normalizeText(cycle?.[key]);
    if (!candidate) continue;
    const parsed = toTimestamp(candidate);
    if (!Number.isNaN(parsed)) {
      return candidate;
    }
  }

  return null;
}

export function resolveSelfReviewDeadlineIso(cycle) {
  return firstValidIso(cycle, [
    "selfReviewDeadline",
    "selfReviewDeadlineAt",
    "selfReviewDueAt",
    "managerRatingUnlockAt",
    "managerRatingEnabledAt",
    "selfReviewWindowEndsAt",
    "endDate",
  ]);
}

export function resolveSelfReviewWindowOpenIso(cycle) {
  return firstValidIso(cycle, [
    "selfReviewWindowOpensAt",
    "selfReviewStartAt",
    "selfReviewOpenAt",
    "endDate",
  ]);
}

export function hasSelfReviewDeadlinePassed(cycle, nowMs = Date.now()) {
  const deadlineIso = resolveSelfReviewDeadlineIso(cycle);
  if (!deadlineIso) return false;

  const deadlineMs = toTimestamp(deadlineIso);
  if (Number.isNaN(deadlineMs)) return false;

  return nowMs >= deadlineMs;
}

export function isSelfReviewSubmitted({ checkIn, goalSelfReview }) {
  const checkInStatus = normalizeText(checkIn?.selfReviewStatus);
  const goalReviewStatus = normalizeText(goalSelfReview?.status);

  return (
    checkInStatus === SELF_REVIEW_STATUSES.SUBMITTED ||
    goalReviewStatus === SELF_REVIEW_STATUSES.SUBMITTED
  );
}

export function getManagerRatingGate({ isFinalCheckIn, checkIn, goalSelfReview, cycle }) {
  if (!isFinalCheckIn) {
    return {
      isFinalCheckIn: false,
      selfReviewSubmitted: true,
      selfReviewDeadlinePassed: true,
      canManagerSubmitRating: true,
      blockedReason: "",
    };
  }

  const selfReviewSubmitted = isSelfReviewSubmitted({ checkIn, goalSelfReview });
  const selfReviewDeadlinePassed = hasSelfReviewDeadlinePassed(cycle);
  const canManagerSubmitRating = selfReviewSubmitted || selfReviewDeadlinePassed;

  return {
    isFinalCheckIn: true,
    selfReviewSubmitted,
    selfReviewDeadlinePassed,
    canManagerSubmitRating,
    blockedReason: canManagerSubmitRating ? "" : "Waiting for employee self-review",
  };
}