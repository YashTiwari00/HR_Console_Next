# Email + Google Setup (Local)

This runbook helps you finish two prerequisites:
1. Connect Google Calendar for seeded users.
2. Enable Gmail SMTP for notification emails.

## 1) Required environment variables

Add these to your `.env` file:

```env
# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google/callback
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000

# Notification Email (Gmail SMTP)
EMAIL_USER=your-gmail-account@gmail.com
EMAIL_PASS=your-gmail-app-password
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
4. Check inbox for delivered email.

## Common failures

- `Google Calendar is not connected...`
  - User has not completed OAuth flow for that account.
- `Email delivery failed` in notification jobs:
   - Check `EMAIL_USER` and `EMAIL_PASS` and verify Gmail app-password access is enabled.
- No emails sent but in-app notifications appear:
  - Ensure scheduler is being run and email jobs exist in `notification_jobs`.
