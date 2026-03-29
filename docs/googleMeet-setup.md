# Google Meet Feature Setup (Implemented APIs)

## 1) Install dependencies

- googleapis has been added to package.json.
- Run:

npm install

## 2) Configure environment variables

Add these to your environment file:

- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- ORG_DEFAULT_TIMEZONE (example: UTC)
- NEXT_PUBLIC_GOOGLE_TOKENS_COLLECTION_ID (default: google_tokens)
- NEXT_PUBLIC_GOOGLE_MEET_REQUESTS_COLLECTION_ID (default: google_meet_requests)

## 3) Create Appwrite schema additions

Run audit first:

npm run schema:audit

Apply changes:

npm run schema:apply

New collections expected:

- google_tokens
- google_meet_requests

## 4) Token precondition for scheduling

Current implementation expects each user who needs calendar actions to have a token row in google_tokens:

- employee token is used for freebusy checks
- manager token is used for creating calendar events

Required fields in google_tokens:

- userId
- email
- accessToken
- refreshToken
- expiry

Token persistence behavior:

- Automatic (best effort): on OAuth callback session creation at /api/auth/session, the system tries to extract provider tokens from Appwrite session payload and upsert google_tokens.
- Fallback manual endpoint: POST /api/google/tokens for authenticated user self-upsert when provider tokens are not present in session payload.
- Admin fallback endpoint: POST /api/google/tokens/admin-upsert for manager/hr to set token for a target user (manager is restricted to own team).

Fallback payload example:

{
	"accessToken": "ya29...",
	"refreshToken": "1//0g...",
	"expiry": "2026-03-26T14:00:00.000Z",
	"scope": "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events",
	"email": "user@company.com"
}

## 5) New API routes

- GET /api/google/tokens/status
- POST /api/google/tokens
- POST /api/google/tokens/admin-upsert
- POST /api/calendar/freebusy
- POST /api/calendar/create-meeting
- GET /api/meet-requests
- POST /api/meet-requests
- PATCH /api/meet-requests/:requestId

## 6) New UI pages

- /employee/meetings
- /manager/meetings

Manager page includes Admin Token Tools card so you can:

- set employee token -> verify with Check Availability
- set manager token -> verify with Direct Schedule / Request Schedule actions
- view selected-user token status (connected/expired/not connected) before testing

Dedicated setup page is available:

- /manager/google-token-setup

One-time setup rule (to avoid repeating manual input):

- Save refresh token once for each user (manager and relevant employees).
- Access token can be omitted after first setup; backend auto-generates and refreshes access token using stored refresh token.
- Email field is no longer required in setup flow; backend resolves it from user profile.

Recommended steps now:

1. Open /manager/google-token-setup.
2. Select your manager user, paste refresh token, click Save Token.
3. Select each employee who needs availability checks, paste refresh token, click Save Token.
4. Verify status badge shows connected.
5. Go to /manager/meetings and use Check Availability + Schedule Meeting normally.

Dashboard links were also added:

- Employee dashboard -> Open Meetings
- Manager dashboard -> Open Meetings

## 7) Role rules enforced

- Employee can create requests only
- Manager can schedule directly without request
- Manager can act only on assigned employee requests
- Employee request creation is blocked if employee Google token is not connected
