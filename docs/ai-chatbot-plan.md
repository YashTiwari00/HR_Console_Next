# AI Chatbot & OpenRouter Integration Plan

## Overview

Add a role-aware floating chatbot throughout the app (landing page, employee, manager, HR dashboards) plus upgrade the existing AI features (goal suggestions, check-in summaries) to use real LLM responses via the OpenRouter API.

---

## Prerequisites

1. Get an API key from [openrouter.ai](https://openrouter.ai)
2. Add to `.env`:
   ```
   OPENROUTER_API_KEY=sk-or-...
   ```

---

## Files to Create

### 1. `/lib/openrouter.js` — Shared helper
Server-side only. Wraps the OpenRouter `/chat/completions` endpoint (OpenAI-compatible format).

```js
export async function callOpenRouter({ model = "openai/gpt-4o-mini", messages, jsonMode = false }) {
  // POST https://openrouter.ai/api/v1/chat/completions
  // Authorization: Bearer OPENROUTER_API_KEY
  // Returns: assistant message content string
}
```

**Model recommendation:** `openai/gpt-4o-mini` — fast, cheap, good quality.

---

### 2. `/app/api/ai/chat/route.js` — Chat endpoint

```
POST /api/ai/chat
Body: { messages: [{role, content}], role: 'employee'|'manager'|'hr'|'guest', userName?: string }
Response: { reply: string }
```

Builds a role-specific system prompt and calls OpenRouter. No auth required for guest; requires auth for role-specific.

**System prompt per role:**

| Role | Focus |
|------|-------|
| `employee` | Goals, progress updates, check-ins, cycle timeline, how to write good goals |
| `manager` | Team approvals, check-ins, team progress, coaching, own cycle |
| `hr` | Team assignments, governance queue, cycle monitoring, approval oversight |
| `guest` | What HR Console is, role overview, how to sign up / log in |

---

### 3. `/src/components/ui/ChatBot.tsx` — Floating widget

**Props:**
```ts
interface ChatBotProps {
  role?: 'employee' | 'manager' | 'hr' | 'guest';
  userName?: string;
}
```

**Behaviour:**
- Fixed bottom-right button (z-index: 10000), chat bubble icon
- Click to toggle a 360×480px panel above it
- Panel: header (role label + green online dot) / scrollable message list / input + send button
- Enter key submits; Shift+Enter for newlines
- Auto-scrolls to latest message
- Shows "Thinking..." indicator while loading
- Role-specific greeting as the first assistant message
- Uses app CSS variables (`--color-primary`, `--color-surface`, `--color-border`, `--color-text`, etc.) so it adapts to light/dark theme automatically

**Placement:**
- In each role layout: rendered as a sibling to `<SidebarLayout>` inside a React fragment
- On landing page: rendered as a sibling to `.lp-root` div (outside it, so cursor:none doesn't apply)

---

## Files to Modify

### 4. `/app/api/ai/goal-suggestion/route.js`

Replace the static `buildSuggestions()` function with an OpenRouter call.

**Prompt sent to OpenRouter:**
```
Generate 3 goal suggestions for an employee with designation "{designation}"
using the {frameworkType} framework. Their intent: "{prompt}".
Return JSON: { "suggestions": [{ "title", "description", "weightage", "rationale" }] }
```

Keeps existing: auth check, usage cap tracking via Appwrite, error handling.

---

### 5. `/app/api/ai/checkin-summary/route.js`

Replace the extractive text parsing with an OpenRouter call.

**Prompt sent to OpenRouter:**
```
Summarize this check-in for goal "{goalTitle}":
"{notes}"
Return JSON: { "summary", "highlights": [], "blockers": [], "nextActions": [] }
```

Keeps existing: auth check, role check, usage cap tracking, error handling.

---

### 6. `/app/employee/layout.tsx`

```tsx
import ChatBot from '@/src/components/ui/ChatBot';

// Wrap return in fragment:
return (
  <>
    <SidebarLayout ...>...</SidebarLayout>
    <ChatBot role="employee" userName={userName} />
  </>
);
```

---

### 7. `/app/manager/layout.tsx`

```tsx
<ChatBot role="manager" userName={userName} />
```

---

### 8. `/app/hr/layout.tsx`

```tsx
<ChatBot role="hr" userName={userName} />
```

---

### 9. `/app/page.tsx` (landing page)

```tsx
return (
  <>
    <div className="lp-root">...</div>
    <ChatBot role="guest" />
  </>
);
```

---

## Architecture Diagram

```
Browser
  └── ChatBot component (fixed overlay, z:10000)
        └── POST /api/ai/chat  (Next.js route, server-side)
              └── callOpenRouter()  (lib/openrouter.js)
                    └── OpenRouter API  (openrouter.ai)
                          └── openai/gpt-4o-mini (or any model)

Landing page: ChatBot role="guest"   → explains HR Console
/employee/*:  ChatBot role="employee" → goals, progress, check-ins help
/manager/*:   ChatBot role="manager"  → approvals, team coaching help
/hr/*:        ChatBot role="hr"       → governance, assignments help
```

---

## AI Suggestions Integration Points

| Feature | Location | Trigger |
|---------|----------|---------|
| Goal suggestions | `/employee/goals` (create goal form) | "Suggest goals" button → POST `/api/ai/goal-suggestion` |
| Check-in summary | `/employee/check-ins` & `/manager/team-check-ins` | "Summarise notes" button → POST `/api/ai/checkin-summary` |
| Chatbot inline hints | Any page | Via ChatBot widget |

The goal-suggestion and checkin-summary routes already exist and are already wired into the frontend — only the backend implementation needs to be upgraded from rule-based to OpenRouter.

---

## Cost Estimate

Using `openai/gpt-4o-mini` on OpenRouter:
- ~$0.15 / 1M input tokens, ~$0.60 / 1M output tokens
- A typical chat message exchange ≈ 800 tokens total → ~$0.0005 per exchange
- Goal suggestion call ≈ 600 tokens → ~$0.0004 per call
- Very low cost even at moderate usage
