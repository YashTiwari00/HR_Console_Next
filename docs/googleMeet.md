# 📅 Google Meet & Calendar Integration (HR Management System)

## 📌 Feature Overview

This feature enables **Managers and Employees** to seamlessly schedule and manage meetings within the HR system using **Google Calendar integration**.

### 🎯 Core Capabilities

* Managers can view employee availability
* Managers can schedule meetings based on free time slots
* Google Meet links are automatically generated
* Meeting invitations are sent via email
* Events are added to both Manager and Employee calendars

---

## 🧠 System Architecture

```
Frontend (Next.js UI)
        ↓
Backend (API Routes)
        ↓
Google Calendar API
        ↓
Google Services (Calendar + Meet + Email)
```

---

## ⚙️ Technologies Used

* Google Calendar API
* OAuth 2.0 Authentication (already implemented)
* Appwrite (Authentication + Database)
* Next.js (Frontend + Backend)

---

## 🚀 Implementation Plan (Step-by-Step)

---

# 🧩 PHASE 1: Token Management (CRITICAL FOUNDATION)

## ✅ Step 1: Create Token Storage

Create a database collection:

```
Collection Name: google_tokens
```

### Fields:

* userId
* email
* accessToken
* refreshToken
* expiry

---

## ✅ Step 2: Store Tokens After OAuth

After successful Google OAuth:

* Extract:

  * access_token
  * refresh_token
  * expiry time
* Save into `google_tokens` collection

⚠️ Without storing refreshToken, your system will break after 1 hour.

---

## ✅ Step 3: Create Token Refresh Utility

Create a backend utility function:

```
getValidAccessToken(userId)
```

### Logic:

1. Fetch token from DB
2. Check expiry
3. If expired:

   * Use refresh_token to get new access_token
4. Return valid token

---

# 📅 PHASE 2: Fetch Employee Availability

---

## ✅ Step 4: Create Free/Busy API

### Endpoint:

```
/api/calendar/freebusy
```

### Input:

```
employeeId
startDate
endDate
```

---

## ✅ Step 5: Call Google FreeBusy API

Use Google Calendar API:

* Method: freebusy.query
* Pass employee email and date range

### Output:

* List of busy time slots

---

## ✅ Step 6: Connect API to UI

### Manager Flow:

1. Manager selects employee
2. Clicks "Check Availability"
3. API returns busy slots
4. UI displays:

   * Busy slots
   * Free slots (calculated)

---

# 🎯 PHASE 3: Schedule Meeting (CORE FEATURE)

---

## ✅ Step 7: Create Meeting API

### Endpoint:

```
/api/calendar/create-meeting
```

### Input:

```
managerId
employeeEmail
startTime
endTime
title
```

---

## ✅ Step 8: Create Event in Google Calendar

Use Google Calendar API:

* Method: events.insert

---

## ⚠️ IMPORTANT CONFIGURATION (MANDATORY)

You MUST include:

```
conferenceData: {
  createRequest: {
    requestId: "unique-random-id"
  }
}
```

AND:

```
conferenceDataVersion = 1
```

---

## 🎉 Automatic Outcomes

Once event is created:

* Google Meet link is generated
* Email invitation is sent
* Event is added to both calendars

---

# 🖥️ PHASE 4: UI Integration

---

## ✅ Step 9: Manager Dashboard

Add:

* Employee list
* "Check Availability" button
* Time slot selector
* "Schedule Meeting" button

---

## ✅ Step 10: Employee Dashboard

Add:

* Upcoming meetings list
* Meeting details:

  * Title
  * Time
  * Google Meet link

---

# 🔁 PHASE 5: Testing Flow (MANDATORY)

---

## ✅ End-to-End Flow

1. Manager opens dashboard
2. Selects employee
3. Clicks "Check Availability"
4. Views free slots
5. Selects a slot
6. Clicks "Schedule Meeting"
7. Backend calls Google API
8. Google:

   * Generates Meet link
   * Sends email
   * Updates calendars

---

# ⚠️ Common Errors & Fixes

---

## ❌ Meet link not generated

Cause:

* Missing `conferenceDataVersion`

Fix:

* Add `conferenceDataVersion = 1`

---

## ❌ Unauthorized (401 Error)

Cause:

* Expired access token

Fix:

* Implement token refresh logic

---

## ❌ No availability data

Cause:

* Incorrect date/time format

Fix:

* Use ISO format (YYYY-MM-DDTHH:mm:ssZ)

---

# 🤖 Agentic AI Integration (Optional Enhancement)

---

## 🎯 Role of AI

AI is responsible for:

* Suggesting optimal meeting times
* Avoiding scheduling conflicts
* Understanding natural language requests

---

## ❌ AI Should NOT:

* Call Google APIs
* Handle authentication
* Store tokens

---

## ✅ AI CAN:

* Analyze availability data
* Recommend best meeting slots
* Parse user inputs like:

  * "Schedule tomorrow at 2 PM"

---

# 🧩 Advanced Features (Optional)

* Meeting approval workflow
* Rescheduling system
* Conflict detection alerts
* Smart reminders
* Meeting history tracking

---

# 📌 Final Implementation Checklist

### Backend

* [ ] Token storage implemented
* [ ] Token refresh logic working
* [ ] Freebusy API created
* [ ] Meeting creation API created

### Frontend

* [ ] Availability UI added
* [ ] Schedule meeting UI added
* [ ] Employee meeting list added

### Testing

* [ ] Meet link generated
* [ ] Email received
* [ ] Event visible in both calendars

---

# 🚀 Resume Description (Optional)

“Implemented Google Calendar integration with automated meeting scheduling, real-time availability tracking, and Google Meet link generation, enhanced with an AI-based scheduling assistant.”

---
