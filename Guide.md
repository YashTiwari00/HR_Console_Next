# MASTER PRODUCT REQUIREMENT

# DOCUMENT (PRD)

## AI-Native, Seamless, Decision-Intelligent Performance

## Management System (PMS)

## 1. Product Vision & Philosophy

**1.1 Vision**
Build a **unified** , **next-generation, AI-native Performance Management System** that feels like a **coach
and decision partner** , not an HR system. System that reimagines the employee performance
journey-from goals to check-ins to annual reviews- via **GenAI, gamification, predictive analytics, and
zero-friction UX**.
The product must seamlessly guide employees, managers, HR, and leadership through goals, check-ins,
reviews, and decisions with **minimal friction, maximum clarity, and trusted intelligence.** The system
must work flawlessly across **mobile, desktop, tablet, Windows, Mac, Linux, Android, iOS** , with strong
compliance and role-based visibility.
**1.2 Problem Statement**
Organizations struggle with:
● Complex PMS tools and low adoption
● Low manager participation
● Poor goal-setting quality
● Lack of actionable insights
● Manual HR workload
● Weak employee engagement
● Lack of trust in ratings
● Manual, error-prone reviews
● No real decision intelligence for leaders


The PMS should:
● Replace form-heavy workflows with conversations
● Reduce reporting fatigue and manual HR effort
● Improve the quality of goals, feedback, and decisions and timeliness
● Provide predictive, explainable insights for leaders & HR
● Work seamlessly across devices and platforms
● Increase PMS participation and completion
● Deliver AI-powered growth pathways for employees
**1.2 Core Design Principles**
● Zero-friction, zero-confusion UX
● Conversation over configuration
● AI suggests, humans decide
● Explainability by default
● Ratings without toxicity
● One continuous journey, not fragmented modules

## 2. Target Personas & System Tone

**Employees**
● **Tone:** Encouraging, gamified, growth-focused
● **Needs:** Clarity, motivation, purpose, feedback
**Managers**
● **Tone:** Insight-driven, coaching-oriented, efficient
● **Needs:** Low-effort reviews, strong summaries, coaching guidance
**HR**
● **Tone:** Professional, compliant, analytical
● **Needs:** Calibration, audits, governance, scalability
**Leadership**
● **Tone:** Strategic, predictive, business-oriented
● **Needs:** Trends, risks, readiness, exports
**System Tone**
Friendly, intelligent, bias-aware, explainable,proactive, conversational like buddy.

## 4. High-Level Architecture & Core Modules


**Core Modules**

1. Role-Base(Manager, Employee etc personas) Home Dashboard Page
2. Conversational Goal Engine
3. Performance Framework Selection
4. Single Performance Timeline (Lifecycle View)
5. **AI Goal Setting & Alignment
6. Progress & Gamification Layer - How much goal you have completed out of 100% - shows**
    **progress bar and gamify the process for more engagement**
7. AI-Powered Check-Ins
8. Reviews & Ratings Engine
9. Employee Growth Hub
10. Manager Dashboard (Team Dashboard and Employee Dashboard)
11. HR Control Center - Admin Access for particular business
12. Leadership Command Center - Access to their business
13. Floating AI Assistant (Buddy Mode) - like a chatbot
14. Admin, Security & Audit Layer
Each module links logically to the next based on the performance lifecycle.
**Process Flow :
Cycle 1:**
If Employee :
Log-in -> System Fetches their role, domain, department, business and all details
Goal Setting Framework -> System suggests Goal Setting framework (OKR, MBO, Hybrid or other
frameworks based on role and domain) -> employee chooses same framework -> AI suggests 4-5 Goals
based on SMART Goal setting framework (these goals are fetched from Key Goal Lirary + LLM based
from web / some websites like O*Net and similar JD platforms + Based on Annual Operating Plan AI
suggest the goal to employee) -> user can also put prompt for asking how many goals they want and
what they want to include in their goals for this year so that goals becomes more relevant but AI also
cross checks if they are role/industry/organisation relevant (SMART framework) and then weighatge is
also suggested by AI -> employee can edit or submit them.
After Submission goals goes to manager for approval (who can ask for edits / can approve the goals)
Here, Manager can also drag and drop their goal (let’s say 100Rs I wnat to achieve in a year, so
Employee A will contribute 30% to it i.e 30Rs) so they can drag and drop and mention % of more details
about the same, which then will be visible in that employee/team members goals.
Then Check-in Window opens after goals gets approved and a meeting can be initiated either by
employee or manager.
In check-in Employee can write their comments against each goal and attach files (png/pdf/mail
attachments as proofs) which can be read by AI (optional feature) and added into additional justification
for those goals when they go to manager.
When initiated -> user should be able to see a vacant slot in the calendar of all stakeholders and
schedule a check-in, which gets notified to all of them (integrate dwith Google Calendar and google Meet)
Then Check-in meeting happens (transcript generated in Google Meet) is fetched in App and
autopopulated against the feedback of each goal as discussed in the meeting.
So this can continue for each Quarter (if chosen OKR framework) or can be annual basis.
This check-in meetings can happen as many times as employee/manager wants(caped to 5 for each
quarter)


When Employee ticks the check-box (as this is last check-in) or self-review deadline window (as
mentioned by HR/Admin) after that rating window can be enabled for manager.
Based on all check-ins, self reviews and meetings - AI gives summary and suggest rating .Manager then
later can give same rating or override it for the employee against each goal which is then transformed into
final rating based on weighted average logic given.
Then final rating for each employee for each quarter and then converted into annual rating can be done
by system itself to avoid biases.
Now employee should be able to see their progress against their goal (0-100% bar) and what they need
to do to meet that 100% and achieve top rating.
Employee / Manager/ Team Lead should also be able to see how they are contributing to the overall goal
of business (eg : Business has target of 500Rs and 100Rs was target to that manager, which manager
may have achieved either Rs.80 or Rs.120, so they should be able to see how they are helping to move
that scale of Business target).
**Cycle 2 :**
For managers they can see stack ranking (top to bottom performers) of their team.
Business head can it for whole business like a organisational chart (when clicked on 1 manager, his/her
team opens and can have view of their team and so on).
HR / Admin has access to everything and holistic view.
Manager, Business Head, HR can get 1-2 pager report (export/downloadable) on performance report -
strengths, weaknesses, Learning and development required in which area, career pathway (if possible
based on given inputs) readiness for next level a proper detailed report for individual, team and business
based on all performance history data (quarter wise and year-wise too).
It should also suggest people who performed well in Quarter 1 / YEar 1 and in Quarter 2/Year 2 if they
have rating drop then do analysis(reasons etc) of it and share report with manager, BH/HR.
**Cycle 3 :**
Navigation buddy helper at the beginning when new user comes to use platform to show steps to use the
App.
Chatbot to help doubts regarding App and navigation/ timelines for window closure.
Mails to employee/manager/business -can be scheduled by admin :

- To employees : regarding goal setting and window should close after let’s say 1 month from launch date,
regarding chec-in schedules and related timelines
- To managers : goal approval, pending confirmation/approvals on goals / check-in meetings/ ratings and
reviews.
Uploading google sheet link / Excel tab to upload Goals in a predefined format in goal-setting by anyone
(employee/Manager) which gets atopopulated in our system format and is visible to employee and their
manager for check-in or reviews.
Additional reviewers - for dual reporting and then review/feedback collection from both managers and
other stakeholders( not rating from them other stakeholders) - managers can give ratings only. So if a
person has 2 managers and his/her work is 60% with Manager 1 and 40% with another,same review will
be done and allocated ratings according to the weightage.
AI feature usage to be capped as 2/3/5 based on the feature where it is being used.
**Cycle 4 :**
All this performance review, rating can be further used for succession planning, increments, promotions,


L&D etc processes

## 5. Seamless UI / UX System (Critical Requirement)

#### 5.1 UX Objective

The UI must feel **invisible**. Users should never feel they are filling a system. The system should
continuously guide users through the performance lifecycle.

#### 5.2 Non-Negotiable UX Rules

```
● Context persistence across tabs and views
● Single vertical timeline per cycle (no fragmented tabs)
● Inline actions only (edit, approve, regenerate)
● One primary action per screen
● Progressive disclosure (show only what’s needed)
```
#### 5.3 Single Timeline UX

Replaces traditional tabs. Timeline nodes:

1. Goal Creation
2. Goal Approval
3. Check-ins
4. Review
5. Cycle Closed
Each node:
● Expands inline
● Auto-locks after approval
● Clearly shows status and next step

#### 5.4 Conversational UI Standard

Replace forms with single conversational inputs wherever possible.
Example:
“What are you trying to achieve this quarter?”
AI generates a preview (SMART goal, weightage, AOP link). User can Accept, Edit inline, or Regenerate.

#### 5.5 Visual Language

```
● Use progress rings, status chips, contribution badges
```

```
● Avoid dense tables and grids
● Exceptions only for HR calibration views
```
## 6. Performance Framework Engine

```
● Supports OKR, MBO, Balanced Scorecard, Competency, Hybrid models
● AI recommends framework by role, domain, and org preference
● HR can restrict or configure or customise frameworks
```
## 7. Goal Management System

#### 7.1 Goal Inputs Used by AI

● Annual Operating Plan (AOP) for Business / Organisation
● Goal KPI Library
● Role, domain, title/Designation
● O*NET / NCS role data - JD for that role/role templates
● Historical performance
● LLM reasoning
If domain is missing in library → LLM auto-suggests goals using web knowledge (restricted).
LLM / AI Auto-check for clarity, measurability, and alignment with org objectives.
Manager approves or edits goals when submitted from employee end.

#### 7.2 Goal Cycles

HR defines:
● Quarterly
● Yearly
● Hybrid (yearly goals + quarterly check-ins)
Cycle determines timelines, check-in frequency, and review structure.

#### 7.3 Goal Cascading (Manager → Team)

```
● Drag & drop goals to reportees
● Partial or full weightage
● AI auto-normalizes weights
● Employee acknowledgment required
● Manager approval if it is edited
```
#### 7.4 Goal Lineage View (Critical)


For each goal, show:
Employee Goal → Team Objective → Manager Goal → Business / AOP Objective
Includes:
● Plain-English explanation
● Contribution badge (Low / Medium / High)
● Lightweight progress bar

#### 7.5 Goal Change Log & Drift Detection

```
● Simple timeline view for users (until when they need to finish their goal setting and approval, if not
done by manager it gets autio approved)
● AI flags scope creep, dilution, unrealistic expansion
● Used by Manager and HR during calibration
```
## 8. AI-Powered Check-Ins

#### 8.1 Eligibility Rules

```
● Goals must be approved
● Employee or Manager can initiate
● Monthly or quarterly (configurable)
● Blocked if goals pending approval i.e the tab wont open unless goal setting is done/auto
approved.
```
#### 8.2 Before the Meeting

```
● AI generates agenda and discussion points for manager (based on all available data), Suggests
progress checkpoints.
● Employee selects goal status (On Track / Behind / Completed) - RAG factor to get heatmap of
teams - RAG (Red/Amber/Green) progress based on timeline + updates.
● Google Calendar integration is mandatory to schedule meeting inside app by checking available
slots and then goes to other stakeholders for acceptance of meeting invite for check-in meeting
```
### 8.3 During the Meeting

```
● Conversation recorded by google meet and transcript is then autopopulated against each goal
● AI generates summary, decisions and commitments
● AI suggests structured feedback to manager and corrects their tone if its not good according to
given tone. (AI should also score manager based on how detailed, good feedback they have
given out of 10)
● Manager can freely edit before submitting and take help of AI too.
```
#### 8.4 After the Meeting


```
● Transcript gets autopopulated against each goal and give summary of all discussion points of
meeting
● AI summarizes conversation and proposes:
○ Strengths & growth areas
○ Constructive feedback templates
○ Action plans for next period
● AI suggests rating along with rationale for it, which can be overridden by manager
● Manager rates each goal (EE–NI scale) and submits it
● Ratings hidden from employees
● AI auto-populates notes, infers progress, flags blockers/challenges and help required(if any).
```
## 9. Ratings & Scoring Logic

```
● Goal-level ratings visible only to Manager & HR
● Overall score = weighted average of all goals
● Quarter-wise history maintained
● Final ratings visible to employees only after cycle closure
```
##### Each goal is rated using:

##### ○ EE = 5

##### ○ DE = 4

##### ○ ME = 3

##### ○ SME = 2

##### ○ NI = 1

Employee sees:
● Overall band
● Strengths and growth themes
● No raw ratings or stack rank.

## 10. Reviews & AI Performance Summary

At quarter / year end,
AI compiles:
○ All goals + updates
○ Check-in transcript
○ Progress logs
○ Quarter ratings


○ Manager comments for whole period
AI generates:
● Performance trajectory
● Strengths over time
● Weaknesses
● Repeated challenges
● Consistency signals
● Growth and readiness indicators
● Training Need Analysis
Manager adds additional comments (not compulsory) - Microphone enabled for this (speech to text and
then AI auto writes it).
Managers give a **final 5-point rating** used for appraisal.
● Employees see narrative feedback but **never ratings or stack rankings**.
● HR sees complete data.
Used for year-end reviews, 9-box mapping, succession planning.

## 11. Dashboards & Analytics

#### Manager Dashboard

```
● Team progress heatmap
● Check-in status (Check-in completion, done, remaining, in progress, draft etc)
● Goal progress distribution
● Stack ranking (hidden from employees)
● High performers
● At-risk employees
● Missed check-ins
● Individual and team AI summaries
● Team-level heatmap
● Performance vs Potential
```
#### HR Dashboard

```
● Calibration workflows
● Rating distributions
● Audit logs
```

```
● Training needs analysis
● Succession and 9-box views
● Predictive attrition and performance risks
● Org-wide performance trends
```
#### Leadership Command Center

```
● Org-wide performance trends
● Quarter-on-quarter insights
● Predictive attrition and performance risks
● High Potential identification
● Succession readiness
● Aggregated, decision-safe views only
```
## 12. AI-Driven Decision Intelligence Layer

#### 12.1 Objective

##### AI must support human decision-making , not just automation.

#### 12.2 Data Used for Decisions

```
● Goals and weightages
● Check-in transcripts
● Progress trends
● Historical ratings
● AOP alignment
● Goal lineage depth
● Team and org benchmarks
● Manager rating patterns
```
#### 12.3 Decision Support by Persona

**Managers:** coaching priorities, silent underperformance, burnout risk
**HR:** calibration, bias detection, L&D prioritization, succession readiness
**Leadership:** talent investment, capability gaps, delivery risks
AI Tone adapts to user type.
● Helps with:


```
○ Understanding goals
○ Reviewing feedback
○ Navigating dashboards
○ Explaining ratings (for managers/HR)
○ Real-time coaching scripts
```
#### 12.4 AI Modes

● Suggestion Mode (default)
● Decision Support Mode (reviews, calibration, succession)
AI never auto-finalizes decisions.

#### 12.5 Explainability

Every recommendation includes:
● Contributing factors
● Time window used
● Confidence level

## 13. AI Assistant (Floating Buddy)

##### ● An AI Assistant Bot should be available across the app.

##### ● All personas (employee, manager, HR, leader) can ask:

##### ○ “What should I do next?”

##### ○ “How is my rating calculated?”

##### ○ “What does EE mean?”

##### Or any such related questions

##### ● Bot responses should be:

##### ○ Simple

##### ○ Context-aware

##### ○ Free of HR / technical jargon

#### Bot Personality & Tone

##### ● Friendly, buddy-like, and conversational

##### ● Light gamification:

##### ○ Encouragement messages

##### ○ Progress nudges

##### ● Designed for a zero learning curve and high engagement


## 14. Notifications & Nudges

Email reminders for:
● Goal setting
● Check-ins
● Reviews
● Rating submissions
Central system email ID used (Darwin-style).

## 15. Role-Based Visibility

● Employee: own goals, progress, feedback, summaries
● Manager: team goals, ratings, stack ranking
● HR: full access
● Leadership: aggregated AI insights only
HR users can switch between Employee / Manager / HR views in one profile.

## 16. AI Governance & Cost Control

```
● AI usage capped: 3 uses per user per quarter
● Visible AI usage counter
● Limits on AI button clicks and check-ins
● All AI outputs explainable, editable, bias-aware
● Full audit trail
```
## 17. Security, Compliance & Architecture

```
● End-to-end encryption
● GDPR + DPDP Act (India)
● RBAC and audit logs
● Quarterly security audits
● Microservices / serverless architecture
● Google Cloud Run recommended
```

## 18. Success Metrics

```
● PMS completion rate ↑ 60%
● Manager check-ins ↑ 2×
● Feedback frequency ↑ 40%
● HR processing time ↓ 50%
● Calibration time ↓ 40%
```
## 19. Engineering Build Phases

1. Architecture & IA
2. Goal & Framework Engine
3. Timeline UX & Check-ins
4. Dashboards & Decision Intelligence
5. Security & Compliance
6. Beta, Feedback, AI Tuning

## 20. Final Outcome

● Employees feel ownership
● Managers feel supported
● HR becomes strategic
● Leadership trusts decisions
**The PMS becomes a decision cockpit - not a form engine.**


