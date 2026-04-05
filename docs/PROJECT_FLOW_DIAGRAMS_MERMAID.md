# HR Console - Flow Diagrams (Mermaid)

Use these diagrams for architecture reviews, onboarding, and demos.

## 1. Authentication and Role Routing Flow

```mermaid
flowchart TD
    A[User opens route] --> B{Protected route?}
    B -- No --> C[Render public page]
    B -- Yes --> D{Has Appwrite session cookie?}
    D -- No --> E[Redirect to /login]
    D -- Yes --> F[Middleware calls /api/auth/redirect]
    F --> G{redirectTo returned?}
    G -- No --> E
    G -- Yes --> H{Current path matches redirectTo?}
    H -- Yes --> I[Allow request]
    H -- No --> J[Redirect to role route]

    K[Login page] --> L[loginWithGoogle]
    L --> M[Appwrite OAuth]
    M --> N[/auth/callback with userId + secret]
    N --> O[/api/auth/session]
    O --> P[Set appwrite_session cookies]
    P --> Q[/api/auth/redirect]
    Q --> R{role exists?}
    R -- No --> S[/onboarding]
    R -- Yes --> T[/employee or /manager or /hr]
```

## 2. Create Goal End-to-End Flow

```mermaid
sequenceDiagram
    autonumber
    participant U as Employee User
    participant UI as Employee Goals Page
    participant C as pmsClient.createGoal
    participant API as POST /api/goals
    participant AUTH as requireAuth + requireRole
    participant DB as Appwrite Databases

    U->>UI: Fill form + click Create Draft Goal
    UI->>C: createGoal(payload)
    C->>API: POST /api/goals with JWT header
    API->>AUTH: Authenticate session and role
    AUTH-->>API: profile + databases context

    API->>API: Validate fields/framework/weightage
    API->>API: normalizeCycleId
    API->>DB: List existing goals for cycle
    DB-->>API: Existing rows
    API->>API: enforce total weightage <= 100

    API->>DB: createDocument draft (compat fallback attempts)
    DB-->>API: Created goal
    API-->>C: 201 {data: goal}
    C-->>UI: resolve promise
    UI->>UI: Clear form partial state
    UI->>UI: Show success message
    UI->>API: GET /api/goals (refresh list)
    API->>DB: fetch scoped goals
    DB-->>API: goal list
    API-->>UI: Updated goal list
    UI-->>U: Draft goal visible in My Goals
```

## 3. Goal Approval Flow (Manager or HR)

```mermaid
flowchart TD
    A[Goal status submitted] --> B[GET /api/approvals queue]
    B --> C[Decision UI]
    C --> D[POST /api/approvals]
    D --> E{Valid decision?}
    E -- No --> F[400 Invalid decision]
    E -- Yes --> G{Role and ownership allowed?}
    G -- No --> H[403 Forbidden]
    G -- Yes --> I{Goal still submitted?}
    I -- No --> J[400 Wrong status]
    I -- Yes --> K[Update goals.status]
    K --> L[Insert goal_approvals record]
    L --> M[Return updated goal + approval]
```

## 4. Check-in Completion and Final Rating Flow

```mermaid
flowchart TD
    A[Manager opens check-in] --> B[PATCH /api/check-ins/:checkInId]
    B --> C{Goal approved or closed?}
    C -- No --> D[400 Not eligible]
    C -- Yes --> E[Mark check-in completed]
    E --> F{isFinalCheckIn?}
    F -- No --> G[Return completed check-in]
    F -- Yes --> H{Manager role and rating 1..5 valid?}
    H -- No --> I[400 or 403]
    H -- Yes --> J[Update goal managerFinalRating fields]
    J --> K[getCycleState]
    K --> L[Visibility hidden or visible]
    L --> M[computeAndPersistEmployeeCycleScore]
    M --> N[Return completed check-in]
```

## 5. HR Cycle Close Flow

```mermaid
flowchart TD
    A[HR clicks Close Cycle] --> B[POST /api/hr/cycles/:cycleId/close]
    B --> C[Require HR role]
    C --> D[List cycle goals]
    D --> E[Filter approved or closed goals]
    E --> F[Build employee-manager pairs]
    F --> G[Compute and persist each employee cycle score as visible]
    G --> H[setCycleRatingsVisibility true]
    H --> I[Update or create goal_cycles state closed]
    I --> J[Return cycleId, closed true, employeesUpdated]
```

## 6. AI Goal Suggestion Flow with Usage Cap

```mermaid
flowchart TD
    A[User clicks Suggest with AI] --> B[POST /api/ai/goal-suggestion]
    B --> C[Validate cycleId + frameworkType]
    C --> D[assertAndTrackAiUsage]
    D --> E{Remaining quota > 0?}
    E -- No --> F[429 Usage cap reached]
    E -- Yes --> G[Call OpenRouter JSON mode]
    G --> H[Normalize suggestions]
    H --> I[Return suggestions + usage metadata]
```

## 7. Team Assignment Governance Flow

```mermaid
flowchart TD
    A[Leadership opens team assignments] --> B[GET /api/team-assignments]
    B --> C[Leadership selects employee and manager]
    C --> D[POST /api/team-assignments]
    D --> E[Validate employee role and manager role]
    E --> F[Update users.managerId and assignment metadata]
    F --> G[Return updated employee profile]

    H[Leadership maps manager to parent manager] --> I[POST /api/manager-assignments]
    I --> J[Validate manager and leadership roles]
    J --> K[Update manager hierarchy assignment metadata]
    K --> L[Return mapping summary]
```
