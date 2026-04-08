# Task 6 - Create Agent Dialog Enhancement

## Summary
Refactored the existing `AgentFormDialog` component in `DashboardPage.tsx` to use a tabbed layout with three tabs: Basic Info, Skills, and Profile. Updated provider/model options to match the specified list.

## Changes Made
1. Added `Tabs, TabsContent, TabsList, TabsTrigger` imports from `@/components/ui/tabs`
2. Reorganized form fields into 3 tabs:
   - **Basic Info**: Name, Description, Type, Status, Provider, Model, System Prompt, Temperature, Max Tokens
   - **Skills**: Skill Binding with checkbox list, bound count badge
   - **Profile**: Agent Profile (agent.md), Soul/Personality (soul.md)
3. Updated DEFAULT_FORM default provider to 'nvidia' and model to 'z-ai/glm4.7'
4. Updated provider options to only show nvidia/openai (removed anthropic/local)
5. Updated model select to always use Select dropdown with 3 options: z-ai/glm4.7, z-ai/glm5, moonshotai/kimi-k2.5
6. Dialog now uses flex column layout with overflow handling per tab

## Verification
- `bun run lint` passes with zero errors
- Dev server returns 200 OK for /api/stats and /api/agents
- All existing DashboardPage functionality preserved (create, edit, delete agent flows)
