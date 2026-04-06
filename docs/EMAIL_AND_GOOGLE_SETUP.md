# Email + Google Setup (Local)

This runbook helps you finish two prerequisites:
1. Connect Google Calendar for seeded users.
2. Enable Resend for notification emails.

## 1) Required environment variables

Add these to your `.env` file:

```env
# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/callback
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000

# Resend Email
RESEND_API_KEY=...
NOTIFICATION_EMAIL_FROM=Times HR <onboarding@your-domain.com>
# Optional:
NOTIFICATION_EMAIL_REPLY_TO=hr@your-domain.com
```

## 2) Google Cloud Console setup

In your Google OAuth client configuration, add this redirect URI exactly:

- `http://localhost:3000/api/google/callback`

Also ensure Calendar scopes are enabled in consent flow:
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`

## 3) Connect Google for seeded employee and manager

1. Start local app:
   - `npm run dev`
2. Sign in as seeded employee user and click Google connect flow in app.
3. Complete OAuth consent screen.
4. Sign out and repeat for seeded manager user.

## 4) Verify Google token connection

After each login, call:
- `GET /api/google/tokens/status`

Expected response indicates connected state.

## 5) Apply schema and run smoke checks

```powershell
npm run schema:apply
npm run smoke:api
```

## 6) Validate email behavior

1. Trigger one event (goal add / check-in submit / goal approve / scheduler run).
2. Run scheduler to process queued email jobs:
   - `POST /api/notifications/scheduler`
3. Check notification jobs in HR Notifications page:
   - status should move from `pending` to `sent`.
4. Check inbox and/or Resend dashboard for delivered email.

## Common failures

- `Google Calendar is not connected...`
  - User has not completed OAuth flow for that account.
- `Resend delivery failed` in notification jobs:
  - Check `RESEND_API_KEY`, sender domain verification, and `NOTIFICATION_EMAIL_FROM`.
- No emails sent but in-app notifications appear:
  - Ensure scheduler is being run and email jobs exist in `notification_jobs`.
