UI DESIGN RULES

GENERAL PRINCIPLES

The UI should follow a minimalistic SaaS dashboard style similar to Stripe, Linear, and Vercel.

Avoid flashy visual effects and focus on clarity, spacing, and typography.

---

SPACING

Use the spacing tokens only.

Preferred layout gaps:

space-2
space-3
space-4

Never hardcode margins or spacing.

---

COLOR USAGE

Primary color should only be used for important actions such as buttons.

Surface color should be used for cards and panels.

Background color should be used for the page.

Muted text color should be used for metadata and secondary information.

---

BORDER RADIUS

Inputs and buttons → radius-sm

Cards → radius-md

Large containers → radius-lg

---

SHADOWS

Cards should use shadow-sm.

Dropdowns and popovers should use shadow-md.

Modals should use shadow-lg.

Avoid excessive shadow usage.

---

TYPOGRAPHY

Use typography classes instead of hardcoded font sizes.

Page titles → heading-xl

Section titles → heading-lg

Body text → body

Metadata → caption

---

LAYOUT

Use Stack for vertical layouts.

Use Grid for multi-column layouts.

Use Container for page width control.

Avoid deeply nested layouts.

---

ANIMATION

Allow only subtle hover or focus transitions.

Avoid large motion effects or animations.

---

ICONS

Icons must be consistent in size.

Recommended sizes:

16px
20px

Icons should align with text baseline.

---

DESIGN GOAL

The final UI should feel structured, calm, and professional.

Consistency is more important than visual complexity.