---
Task ID: 3-b - full-stack-developer
Agent: full-stack-developer
Task: Create Permissions API and rewrite PermissionsPage with live data

Work Log:
- Created /api/permissions/route.ts with GET/POST/PUT/DELETE
- Rewrote PermissionsPage.tsx with live API integration

Stage Summary:
- Full CRUD API for permission rules
- Permissions page connected to backend
- All lint checks pass with zero errors
- Dev server confirms /api/permissions returns 200 OK
- 5 seed rules loading correctly from database

### Work Summary
Successfully created the Permissions API and rewrote the PermissionsPage component to replace all static mock data with live API integration. All changes compile cleanly with zero lint errors, and the dev server confirms the API endpoint returns 200 OK with page rendering correctly.

**1. Permissions API (`/src/app/api/permissions/route.ts`) — New**

Created a single API route file handling all CRUD operations:

- **GET /api/permissions**: List all permission rules, optionally filtered by `?mode=allow|deny|ask`. Returns `{ success, data: [...] }`.
- **POST /api/permissions**: Create new permission rule with body `{ mode, pathPattern, isAllowed, commandDenyList? }`. Validates pathPattern and mode. Auto-serializes commandDenyList array to JSON string. Returns 201 with created rule.
- **PUT /api/permissions**: Update existing rule by `{ id }` with optional fields `{ mode, isAllowed, commandDenyList }`. Auto-serializes commandDenyList array. Returns updated rule.
- **DELETE /api/permissions**: Delete rule by `{ id }`. Returns `{ success: true }`.
- All methods use `import { db } from '@/lib/db'` for database access.
- Consistent error handling with try/catch, proper HTTP status codes (400, 404, 500, 201).
- Verified with curl: GET returns 5 seed rules including the one with commandDenyList.

**2. PermissionsPage (`src/components/pages/PermissionsPage.tsx`) — Complete Rewrite**

Replaced all mock data with live API integration:

- **Data Fetching**: `useEffect` + `useCallback` pattern to fetch rules from `GET /api/permissions` on mount. Refresh button in header re-triggers fetch.
- **TypeScript Interfaces**: `PermissionRule` (matching API response shape), `Hook` (in-memory), `DedupedCommand` (derived), `PermissionMode` (client-side), `RuleMode`.
- **Loading Skeletons**: `StatsSkeleton`, `RulesSkeleton`, `CommandsSkeleton` components shown during data fetch using shadcn/ui Skeleton.
- **Error State**: `ErrorState` component with AlertTriangle icon, error message, and "Try Again" button.
- **Path Rules Tab**:
  - Displays rules from API with: pathPattern (monospace), permission badge (mode+isAllowed → Allowed/Denied/Ask), mode badge (allow=emerald, deny=red, ask=amber), command count badge parsed from JSON commandDenyList.
  - "Add Rule" button opens Dialog with form: pathPattern (required, monospace input), mode (Select: allow/deny/ask with icons), isAllowed (Switch toggle).
  - Delete button on each rule calls DELETE API.
  - Empty state shown when no rules exist.
  - Tab trigger shows live rule count badge.
- **Command Deny List Tab**:
  - Derives commands from all rules' parsed commandDenyList JSON arrays.
  - Each command shows: monospace command, associated rule pathPattern, delete button.
  - "Add Command" input with rule selector dropdown (Select component) to pick which rule to add the command to.
  - Delete removes command from the specific rule's commandDenyList via PUT API.
  - Empty state when no denied commands exist.
  - Tab trigger shows live command count badge.
- **Hooks Tab**: Kept as in-memory managed list with 3 default hooks (security-check, audit-log, rate-limit). Toggle pause/resume works in-memory. No API needed.
- **Permission Mode Cards**: Kept as client-side state (Default/Auto/Plan) with framer-motion selection animation.
- **Permission Stats Row**: Live stats from API data — Rules Active (total), Denied Patterns (!isAllowed), Allowed Patterns (isAllowed), Ask Patterns (mode='ask').
- **Toast Notifications**: All CRUD operations (create rule, delete rule, add command, remove command) show success/error toasts via `sonner`.
- **Helper Functions**: `getPermissionBadge(mode, isAllowed)`, `getModeBadge(mode)`, `parseCommandDenyList(json)`.
- Removed all mock data (10 PATH_RULES, 6 DENIED_COMMANDS).

**Files created/modified:**
- `src/app/api/permissions/route.ts` (new)
- `src/components/pages/PermissionsPage.tsx` (completely rewritten with API integration)
