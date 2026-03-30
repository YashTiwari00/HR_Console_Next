import { appwriteConfig } from "@/lib/appwrite";
import { Query, databaseId } from "@/lib/appwriteServer";
import { google } from "googleapis";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_EXPIRY_SKEW_MS = 60 * 1000;
const DEFAULT_TIMEZONE = process.env.ORG_DEFAULT_TIMEZONE || "UTC";

function toIsoString(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }

  return date.toISOString();
}

function isLikelyEmail(value) {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function requireGoogleOAuthEnv() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    const error = new Error("Google Calendar is not configured. Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.");
    error.statusCode = 500;
    throw error;
  }

  return { clientId, clientSecret };
}

async function findGoogleToken(databases, userId) {
  const response = await databases.listDocuments(
    databaseId,
    appwriteConfig.googleTokensCollectionId,
    [Query.equal("userId", userId), Query.limit(1)]
  );

  return response.documents[0] || null;
}

function parseTokenExpiry(tokenDoc) {
  const expiryMs = new Date(tokenDoc?.expiry || "").valueOf();
  return Number.isNaN(expiryMs) ? 0 : expiryMs;
}

async function refreshAccessToken(tokenDoc) {
  const refreshToken = String(tokenDoc?.refreshToken || "").trim();
  if (!refreshToken) {
    const error = new Error("Google connection is missing refresh token. Please reconnect Google account.");
    error.statusCode = 400;
    throw error;
  }

  const { clientId, clientSecret } = requireGoogleOAuthEnv();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    const error = new Error(payload?.error_description || payload?.error || "Failed to refresh Google access token.");
    error.statusCode = 502;
    throw error;
  }

  const expiresInSeconds = Number(payload.expires_in || 3600);
  const nextExpiry = new Date(Date.now() + Math.max(expiresInSeconds, 60) * 1000).toISOString();

  return {
    accessToken: String(payload.access_token),
    expiry: nextExpiry,
    scope: String(payload.scope || tokenDoc?.scope || "").trim(),
  };
}

async function updateGoogleToken(databases, tokenDoc, updates) {
  return databases.updateDocument(
    databaseId,
    appwriteConfig.googleTokensCollectionId,
    tokenDoc.$id,
    updates
  );
}

export function getOrgDefaultTimezone() {
  return DEFAULT_TIMEZONE;
}

export async function getGoogleTokenStatus(databases, userId) {
  const tokenDoc = await findGoogleToken(databases, userId);
  if (!tokenDoc) {
    return {
      connected: false,
      reason: "missing_token",
      expiresAt: null,
      email: null,
    };
  }

  const expiryMs = parseTokenExpiry(tokenDoc);
  const isExpired = !expiryMs || expiryMs <= Date.now();

  return {
    connected: true,
    reason: isExpired ? "expired" : "ok",
    expiresAt: tokenDoc.expiry || null,
    email: tokenDoc.email || null,
  };
}

export async function getValidAccessToken(databases, userId) {
  const tokenDoc = await findGoogleToken(databases, userId);
  if (!tokenDoc) {
    const error = new Error("Google account is not connected for this user.");
    error.statusCode = 400;
    throw error;
  }

  const expiryMs = parseTokenExpiry(tokenDoc);
  const isValid = expiryMs > Date.now() + TOKEN_EXPIRY_SKEW_MS;

  if (isValid) {
    return {
      accessToken: tokenDoc.accessToken,
      tokenDoc,
    };
  }

  const refreshed = await refreshAccessToken(tokenDoc);
  const updated = await updateGoogleToken(databases, tokenDoc, {
    accessToken: refreshed.accessToken,
    expiry: refreshed.expiry,
    scope: refreshed.scope,
  });

  return {
    accessToken: refreshed.accessToken,
    tokenDoc: updated,
  };
}

function calendarClient(accessToken) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

export async function queryFreeBusy(databases, userId, options) {
  const { accessToken } = await getValidAccessToken(databases, userId);
  const calendar = calendarClient(accessToken);

  const timeMin = toIsoString(options?.startTime);
  const timeMax = toIsoString(options?.endTime);

  if (!timeMin || !timeMax) {
    const error = new Error("startTime and endTime must be valid ISO datetimes.");
    error.statusCode = 400;
    throw error;
  }

  const calendarIds = Array.isArray(options?.calendarIds) && options.calendarIds.length > 0
    ? options.calendarIds
    : ["primary"];

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: String(options?.timeZone || DEFAULT_TIMEZONE),
      items: calendarIds.map((id) => ({ id })),
    },
  });

  const calendars = response?.data?.calendars || {};
  const mergedBusy = [];

  Object.values(calendars).forEach((entry) => {
    const busySlots = Array.isArray(entry?.busy) ? entry.busy : [];
    busySlots.forEach((slot) => {
      if (slot?.start && slot?.end) {
        mergedBusy.push({
          start: slot.start,
          end: slot.end,
        });
      }
    });
  });

  return {
    busy: mergedBusy,
    timeMin,
    timeMax,
    timeZone: String(options?.timeZone || DEFAULT_TIMEZONE),
  };
}

export async function createMeetCalendarEvent(databases, ownerUserId, payload) {
  const { accessToken } = await getValidAccessToken(databases, ownerUserId);
  const calendar = calendarClient(accessToken);

  const startDateTime = toIsoString(payload?.startTime);
  const endDateTime = toIsoString(payload?.endTime);

  if (!startDateTime || !endDateTime) {
    const error = new Error("startTime and endTime must be valid ISO datetimes.");
    error.statusCode = 400;
    throw error;
  }

  const attendeeEmails = Array.isArray(payload?.attendees)
    ? Array.from(
        new Set(
          payload.attendees
            .map((email) => String(email || "").trim().toLowerCase())
            .filter((email) => isLikelyEmail(email))
        )
      )
    : [];

  if (attendeeEmails.length === 0) {
    const error = new Error("At least one valid attendee email is required to schedule a meeting.");
    error.statusCode = 400;
    throw error;
  }

  const attendees = attendeeEmails.map((email) => ({ email }));

  const response = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: "all",
    conferenceDataVersion: 1,
    requestBody: {
      summary: String(payload?.title || "1:1 Meeting").trim() || "1:1 Meeting",
      description: String(payload?.description || "").trim(),
      start: {
        dateTime: startDateTime,
        timeZone: String(payload?.timeZone || DEFAULT_TIMEZONE),
      },
      end: {
        dateTime: endDateTime,
        timeZone: String(payload?.timeZone || DEFAULT_TIMEZONE),
      },
      attendees,
      conferenceData: {
        createRequest: {
          requestId: String(payload?.requestId || crypto.randomUUID()),
        },
      },
    },
  });

  const event = response?.data || {};
  const meetLink =
    event?.hangoutLink ||
    event?.conferenceData?.entryPoints?.find((item) => item?.entryPointType === "video")?.uri ||
    "";

  return {
    eventId: event.id || "",
    eventLink: event.htmlLink || "",
    meetLink,
    status: event.status || "",
    attendeeEmails,
    attendeeCount: attendeeEmails.length,
  };
}

export async function listCalendarEvents(databases, userId, options) {
  const { accessToken } = await getValidAccessToken(databases, userId);
  const calendar = calendarClient(accessToken);

  const timeMin = toIsoString(options?.startTime);
  const timeMax = toIsoString(options?.endTime);

  if (!timeMin || !timeMax) {
    const error = new Error("startTime and endTime must be valid ISO datetimes.");
    error.statusCode = 400;
    throw error;
  }

  const timeZone = String(options?.timeZone || DEFAULT_TIMEZONE);
  const maxResultsRaw = Number(options?.maxResults || 100);
  const maxResults = Number.isFinite(maxResultsRaw)
    ? Math.max(1, Math.min(250, Math.floor(maxResultsRaw)))
    : 100;

  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults,
    timeZone,
  });

  const items = Array.isArray(response?.data?.items) ? response.data.items : [];

  const events = items.map((event) => {
    const meetLink =
      event?.hangoutLink ||
      event?.conferenceData?.entryPoints?.find((item) => item?.entryPointType === "video")
        ?.uri ||
      "";

    const attendees = Array.isArray(event?.attendees)
      ? event.attendees
          .map((attendee) => String(attendee?.email || "").trim())
          .filter(Boolean)
      : [];

    const startTime =
      String(event?.start?.dateTime || "").trim() ||
      String(event?.start?.date || "").trim() ||
      "";
    const endTime =
      String(event?.end?.dateTime || "").trim() ||
      String(event?.end?.date || "").trim() ||
      "";

    return {
      eventId: String(event?.id || ""),
      title: String(event?.summary || "Untitled Event"),
      description: String(event?.description || ""),
      startTime,
      endTime,
      meetLink,
      eventLink: String(event?.htmlLink || ""),
      status: String(event?.status || ""),
      attendees,
    };
  });

  return {
    events,
    timeMin,
    timeMax,
    timeZone,
  };
}
