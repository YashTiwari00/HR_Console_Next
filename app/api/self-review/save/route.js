import { appwriteConfig } from "@/lib/appwrite";
import { ID, Query, databaseId } from "@/lib/appwriteServer";
import { errorResponse, requireAuth, requireRole } from "@/lib/serverAuth";

const SELF_RATING_LABELS = new Set(["EE", "DE", "ME", "SME", "NI"]);

function normalize(value) {
  return String(value || "").trim();
}

function parseSelfRating(input) {
  if (input === null || typeof input === "undefined" || input === "") {
    return { value: null, label: null, provided: false };
  }

  if (typeof input === "number" || /^\d+$/.test(normalize(input))) {
    const value = Number(input);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error("selfRating numeric value must be an integer between 1 and 5.");
    }

    return { value, label: null, provided: true };
  }

  const label = normalize(input).toUpperCase();
  if (!SELF_RATING_LABELS.has(label)) {
    throw new Error("selfRating label must be one of EE, DE, ME, SME, NI.");
  }

  return { value: null, label, provided: true };
}

function normalizeEvidenceLinks(input) {
  if (typeof input === "undefined") {
    return { provided: false, value: [] };
  }

  if (Array.isArray(input)) {
    return {
      provided: true,
      value: input.map((item) => normalize(item)).filter(Boolean),
    };
  }

  return {
    provided: true,
    value: normalize(input)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

function normalizeStructuredField(input) {
  if (typeof input === "undefined") {
    return { provided: false, text: "", json: "" };
  }

  if (typeof input === "string") {
    return { provided: true, text: normalize(input), json: "" };
  }

  return {
    provided: true,
    text: "",
    json: JSON.stringify(input),
  };
}

function hasMeaningfulStructuredContent(field) {
  if (!field?.provided) return false;

  const text = normalize(field.text);
  if (text) return true;

  const json = normalize(field.json);
  if (!json) return false;

  return json !== "{}" && json !== "[]";
}

function isUnknownAttributeError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("unknown attribute") || message.includes("attribute not found in schema");
}

async function updateGoalCompat(databases, goal, payload) {
  try {
    await databases.updateDocument(databaseId, appwriteConfig.goalsCollectionId, goal.$id, payload);
  } catch (error) {
    if (!isUnknownAttributeError(error)) {
      throw error;
    }
  }
}

async function updateFinalCheckInsCompat(databases, goalId, employeeId, payload) {
  try {
    const checkIns = await databases.listDocuments(databaseId, appwriteConfig.checkInsCollectionId, [
      Query.equal("goalId", goalId),
      Query.equal("employeeId", employeeId),
      Query.equal("isFinalCheckIn", true),
      Query.limit(20),
    ]);

    for (const item of checkIns.documents || []) {
      try {
        await databases.updateDocument(databaseId, appwriteConfig.checkInsCollectionId, item.$id, payload);
      } catch (error) {
        if (!isUnknownAttributeError(error)) {
          throw error;
        }
      }
    }
  } catch (error) {
    if (!isUnknownAttributeError(error)) {
      throw error;
    }
  }
}

export async function POST(request) {
  try {
    const { profile, databases } = await requireAuth(request);
    requireRole(profile, ["employee"]);

    const body = await request.json().catch(() => ({}));
    const cycleId = normalize(body.cycleId);
    const goalId = normalize(body.goalId);

    if (!cycleId || !goalId) {
      return Response.json({ error: "cycleId and goalId are required." }, { status: 400 });
    }

    const goal = await databases.getDocument(databaseId, appwriteConfig.goalsCollectionId, goalId);

    if (normalize(goal.employeeId) !== normalize(profile.$id)) {
      return Response.json({ error: "Forbidden for requested goal." }, { status: 403 });
    }

    if (normalize(goal.cycleId) !== cycleId) {
      return Response.json({ error: "goalId does not belong to requested cycleId." }, { status: 400 });
    }

    const rating = parseSelfRating(body.selfRating);
    const evidenceLinks = normalizeEvidenceLinks(body.evidenceLinks);

    const selfCommentProvided = typeof body.selfComment !== "undefined";
    const selfComment = normalize(body.selfComment);

    const achievements = normalizeStructuredField(body.achievements);
    const challenges = normalizeStructuredField(body.challenges);

    const hasAnyField =
      rating.provided ||
      evidenceLinks.provided ||
      selfCommentProvided ||
      achievements.provided ||
      challenges.provided;

    const hasMeaningfulField =
      rating.provided ||
      evidenceLinks.value.length > 0 ||
      normalize(selfComment).length > 0 ||
      hasMeaningfulStructuredContent(achievements) ||
      hasMeaningfulStructuredContent(challenges);

    if (!hasAnyField) {
      return Response.json({ error: "At least one review field must be provided for save." }, { status: 400 });
    }

    if (!hasMeaningfulField) {
      return Response.json(
        { error: "At least one non-empty review field must be provided for save." },
        { status: 400 }
      );
    }

    const reviewKey = `${profile.$id}|${goalId}|${cycleId}`;

    const existingResult = await databases.listDocuments(
      databaseId,
      appwriteConfig.goalSelfReviewsCollectionId,
      [Query.equal("reviewKey", reviewKey), Query.limit(1)]
    );
    const existing = existingResult.documents?.[0] || null;

    if (normalize(existing?.status) === "submitted") {
      return Response.json(
        { error: "Self-review is locked after submission and cannot be edited." },
        { status: 409 }
      );
    }

    const nowIso = new Date().toISOString();
    const payload = {
      updatedAt: nowIso,
      status: "draft",
    };

    if (rating.provided) {
      payload.selfRatingValue = rating.value;
      payload.selfRatingLabel = rating.label;
    }

    if (selfCommentProvided) {
      payload.selfComment = selfComment;
    }

    if (achievements.provided) {
      payload.achievements = achievements.text;
      payload.achievementsJson = achievements.json;
    }

    if (challenges.provided) {
      payload.challenges = challenges.text;
      payload.challengesJson = challenges.json;
    }

    if (evidenceLinks.provided) {
      payload.evidenceLinks = evidenceLinks.value;
    }

    let review;

    if (existing) {
      review = await databases.updateDocument(
        databaseId,
        appwriteConfig.goalSelfReviewsCollectionId,
        existing.$id,
        payload
      );
    } else {
      review = await databases.createDocument(
        databaseId,
        appwriteConfig.goalSelfReviewsCollectionId,
        ID.unique(),
        {
          reviewKey,
          employeeId: profile.$id,
          goalId,
          cycleId,
          status: "draft",
          createdAt: nowIso,
          ...payload,
        }
      );
    }

    await updateGoalCompat(databases, goal, {
      selfReviewId: review.$id,
      selfReviewStatus: review.status || "draft",
      selfReviewSubmittedAt: review.submittedAt || null,
    });

    await updateFinalCheckInsCompat(databases, goalId, profile.$id, {
      goalSelfReviewId: review.$id,
      goalSelfReviewStatus: review.status || "draft",
    });

    return Response.json({ data: review });
  } catch (error) {
    if (String(error?.message || "").includes("selfRating")) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    if (isUnknownAttributeError(error)) {
      return Response.json(
        {
          error:
            "Schema is missing goal self-review attributes. Run schema apply and retry.",
        },
        { status: 500 }
      );
    }

    return errorResponse(error);
  }
}
