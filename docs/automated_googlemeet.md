# 🚀 Google Calendar + Meet Integration (AUTO OAuth)

## 📌 HR Console – FULL IMPLEMENTATION + VALIDATION GUIDE (FOR DEVELOPER)

---

# 🎯 OBJECTIVE

Implement a **production-ready Google Calendar + Google Meet integration** with:

* ✅ One-click **“Connect Google” (OAuth)**
* ✅ Automatic token storage (NO manual paste)
* ✅ Manager can schedule meetings (direct)
* ✅ Employee can request meetings
* ✅ Calendar visible inside app
* ✅ Meet link auto-generated & emailed
* ✅ Existing system remains **unbroken**

---

# ⚠️ IMPORTANT RULES (READ BEFORE STARTING)

1. ❌ DO NOT break existing APIs (check-ins, approvals, etc.)
2. ✅ ONLY ADD new code or safely modify
3. ✅ REUSE:

   * `serverAuth.js`
   * `teamAccess.js`
   * existing API patterns
4. ❌ REMOVE manual token system ONLY after OAuth works

---

# 🧠 FINAL ARCHITECTURE

```
Frontend (UI)
   ↓
/api/google/connect
   ↓
Google OAuth
   ↓
/api/google/callback
   ↓
Store Tokens (DB)
   ↓
Google Calendar API
   ↓
Meet + Email + Calendar Sync
```

---

# ⚙️ PHASE 0: PRE-CHECK (VERY IMPORTANT)

---

## 🧑‍💻 CHECK 1: Existing Files

Verify these exist:

* lib/googleCalendar.js
* lib/googleTokens.js
* /api/calendar/freebusy
* /api/calendar/create-meeting

---

### ✅ IF EXISTS:

* Open and verify:

  * Uses refresh_token
  * Handles expiry
  * Uses Google Calendar API

---

### ❌ IF WRONG:

FIX:

* Must refresh token before API call
* Must not rely on manual token input

---

---

## 🧑‍💻 CHECK 2: ENV VARIABLES

Ensure `.env` contains:

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ORG_DEFAULT_TIMEZONE=Asia/Kolkata
```

---

### ❌ IF MISSING:

→ Add them
→ Restart server

---

---

## 🧑‍💻 CHECK 3: DATABASE COLLECTIONS

Ensure Appwrite has:

* google_tokens
* google_meet_requests

---

### ❌ IF NOT:

Run:

```
npm run schema:apply
```

---

---

# 🧩 PHASE 1: CONNECT GOOGLE (OAUTH START)

---

## 📁 FILE

```
/app/api/google/connect/route.js
```

---

## 🧠 IMPLEMENTATION

* Build Google OAuth URL
* Redirect user

---

## 🔥 REQUIRED PARAMETERS

```
client_id
redirect_uri
response_type=code
scope=https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email
access_type=offline
prompt=consent
```

---

## ✅ VALIDATION

* Click button → redirects to Google
* Login works

---

## ❌ IF NOT WORKING:

* Check redirect URI
* Check client ID

---

---

# 🧩 PHASE 2: CALLBACK (TOKEN HANDLING)

---

## 📁 FILE

```
/app/api/google/callback/route.js
```

---

## 🧠 IMPLEMENTATION

### STEP-BY-STEP:

1. Extract:

```
code = req.query.code
```

2. Call Google:

```
POST https://oauth2.googleapis.com/token
```

3. Send:

```
code
client_id
client_secret
redirect_uri
grant_type=authorization_code
```

---

4. Receive:

```
access_token
refresh_token
expires_in
```

---

5. Get user:

```
serverAuth()
```

---

6. Store in DB:

```
google_tokens
```

---

7. Redirect:

```
/manager OR /employee
```

---

## ✅ VALIDATION

* After login → DB contains tokens
* refresh_token exists

---

## ❌ IF refresh_token missing:

* Remove app:
  👉 https://myaccount.google.com/permissions
* Retry login

---

---

# 🧩 PHASE 3: TOKEN SYSTEM VALIDATION

---

## 📁 FILES

* lib/googleTokens.js
* lib/googleCalendar.js

---

## 🧠 REQUIRED LOGIC

### ✔ Must:

* Check expiry
* Refresh access token
* Store updated token

---

## ❌ IF NOT IMPLEMENTED:

Fix logic:

```
if expired:
   call refresh API
   update DB
```

---

---

# 🧩 PHASE 4: CALENDAR EVENTS API

---

## 📁 FILE

```
/app/api/calendar/events/route.js
```

---

## 🧠 IMPLEMENTATION

* Fetch events using Google Calendar API

---

## 🔐 ROLE RULES

* Employee → only own events
* Manager → own + team
* Use teamAccess.js

---

## 📤 RETURN FORMAT

```
[
  {
    eventId,
    title,
    startTime,
    endTime,
    meetLink,
    attendees
  }
]
```

---

## ✅ VALIDATION

* Employee sees own events
* Manager sees employee events

---

---

# 🧩 PHASE 5: FREEBUSY API CHECK

---

## FILE

```
/api/calendar/freebusy
```

---

## VALIDATION

* Returns busy slots
* No errors

---

## ❌ IF FAIL:

* Token invalid
* Fix refresh logic

---

---

# 🧩 PHASE 6: CREATE MEETING

---

## FILE

```
/api/calendar/create-meeting
```

---

## 🔥 MUST INCLUDE

```
conferenceData: {
  createRequest: { requestId: "random" }
}
conferenceDataVersion = 1
```

---

## RESULT

* Meet link generated
* Email sent
* Calendar updated

---

## ✅ VALIDATION

* Email received
* Meet link works

---

---

# 🧩 PHASE 7: UI IMPLEMENTATION

---

## ADD BUTTON

```
Connect Google
```

---

## ACTION

```
window.location.href = "/api/google/connect"
```

---

## ADD STATUS

```
[Connected ✅]
[Not Connected ❌]
```

Use:

```
/api/google/tokens/status
```

---

---

# 🧩 PHASE 8: REMOVE MANUAL TOKEN SYSTEM

---

## DELETE ONLY AFTER SUCCESS

* /manager/google-token-setup
* admin token APIs
* manual paste UI

---

---

# 🧪 FINAL TESTING (MANDATORY)

---

## TEST 1: OAuth

* Click connect
* Redirect works
* Tokens stored

---

## TEST 2: Calendar

* Events visible

---

## TEST 3: Availability

* Freebusy works

---

## TEST 4: Meeting

* Meet link generated
* Email received

---

## TEST 5: Role Logic

* Employee cannot schedule directly
* Manager can schedule without request

---

---

# 🚨 COMMON ERRORS

---

## ❌ No refresh token

Fix:

```
access_type=offline
prompt=consent
```

---

## ❌ 401 error

Fix:

* Token expired
* Implement refresh

---

## ❌ Meet link missing

Fix:

```
conferenceDataVersion = 1
```

---

---

# 🧠 FINAL CLEAN FLOW

---

## EMPLOYEE

```
Login → Connect Google → View Calendar → Request Meeting
```

---

## MANAGER

```
Login → Connect Google → View Employee → Schedule Meeting
```

---

---

# 🚀 AFTER YOUR WORK IS DONE

---

## 🔍 REVIEW STEP (MANDATORY)

After completing implementation:

👉 **Claude Code will review your work**

---

## WHAT CLAUDE SHOULD VERIFY:

* No manual token system remains
* OAuth flow works end-to-end
* Tokens stored securely
* No API breaks existing features
* Role-based access is correct
* Meeting creation works with Meet link
* Calendar data is correct

---

# 🏁 FINAL RESULT

---

✔ Fully automated Google integration
✔ No manual token handling
✔ Clean architecture
✔ Production-ready feature

---

# 💬 NEXT (OPTIONAL)

* AI scheduling agent
* Full calendar UI (month/week)
* Notifications system

---

# ✅ DONE

---
