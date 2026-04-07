import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  // On Vercel, use /tmp for SQLite (writable filesystem)
  // On local dev, use the project's db/ directory
  const isVercel = !!process.env.VERCEL;
  const dbUrl = isVercel
    ? 'file:/tmp/prisma-custom.db'
    : (process.env.DATABASE_URL || 'file:./db/custom.db');

  return new PrismaClient({
    datasourceUrl: dbUrl,
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  });
}

export const db =
  globalForPrisma.prisma ??
  createPrismaClient();

// In development, reuse the same client across hot reloads
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

// Auto-initialize database on first import (especially for Vercel)
let initialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureDatabase(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (process.env.VERCEL) {
      try {
        // On Vercel, we need to push schema on first API call
        // because SQLite doesn't persist between deployments
        // Use Prisma's internal _executeRaw to check if tables exist
        const result = await db.$queryRawUnsafe(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='Agent'"
        ) as Array<{ name: string }>;

        if (result.length === 0) {
          console.log('[DB] Vercel: No tables found, creating schema...');
          // Create tables using raw SQL from Prisma schema
          await createTables();
          console.log('[DB] Vercel: Schema created, seeding...');
          await inlineSeed();
          console.log('[DB] Vercel: Initialization complete');
        } else {
          // Tables exist, check if data needs seeding
          try {
            const agentCount = await db.agent.count();
            if (agentCount === 0) {
              console.log('[DB] Vercel: Tables exist but no data, seeding...');
              await inlineSeed();
              console.log('[DB] Vercel: Seeding complete');
            } else {
              console.log(`[DB] Vercel: Found ${agentCount} agents, ready`);
            }
          } catch {
            // Table might be partially created, recreate
            console.log('[DB] Vercel: Table check failed, recreating...');
            await createTables();
            await inlineSeed();
          }
        }
      } catch (err) {
        console.error('[DB] Vercel auto-init failed:', err);
      }
    }
    initialized = true;
  })();

  return initPromise;
}

// Create all tables using raw SQL
async function createTables() {
  const sql = `
    CREATE TABLE IF NOT EXISTS "Agent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "type" TEXT NOT NULL DEFAULT 'react',
      "systemPrompt" TEXT NOT NULL,
      "provider" TEXT NOT NULL DEFAULT 'openai',
      "model" TEXT NOT NULL DEFAULT 'gpt-4',
      "status" TEXT NOT NULL DEFAULT 'active',
      "config" TEXT NOT NULL DEFAULT '{}',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "Tool" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "category" TEXT NOT NULL DEFAULT 'system',
      "inputSchema" TEXT NOT NULL DEFAULT '{}',
      "permissionMode" TEXT NOT NULL DEFAULT 'open',
      "isEnabled" BOOLEAN NOT NULL DEFAULT 1,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "Skill" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "content" TEXT NOT NULL,
      "category" TEXT NOT NULL DEFAULT 'general',
      "isLoaded" BOOLEAN NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "Conversation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "agentId" TEXT NOT NULL,
      "title" TEXT NOT NULL DEFAULT 'New Conversation',
      "status" TEXT NOT NULL DEFAULT 'active',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE TABLE IF NOT EXISTS "Message" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "conversationId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "content" TEXT NOT NULL DEFAULT '',
      "toolCalls" TEXT NOT NULL DEFAULT '[]',
      "toolResults" TEXT NOT NULL DEFAULT '[]',
      "tokenCount" INTEGER,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE TABLE IF NOT EXISTS "AgentTeam" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "config" TEXT NOT NULL DEFAULT '{}',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS "TeamMember" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "teamId" TEXT NOT NULL,
      "agentId" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'worker',
      CONSTRAINT "TeamMember_teamId_agentId_key" UNIQUE ("teamId", "agentId"),
      CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AgentTeam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "TeamMember_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE TABLE IF NOT EXISTS "Task" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "agentId" TEXT,
      "teamId" TEXT,
      "title" TEXT NOT NULL,
      "description" TEXT,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "priority" TEXT NOT NULL DEFAULT 'medium',
      "progress" INTEGER NOT NULL DEFAULT 0,
      "result" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Task_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "Task_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AgentTeam" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE TABLE IF NOT EXISTS "Memory" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "agentId" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "category" TEXT NOT NULL DEFAULT 'context',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Memory_agentId_key_key" UNIQUE ("agentId", "key"),
      CONSTRAINT "Memory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE TABLE IF NOT EXISTS "PermissionRule" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "mode" TEXT NOT NULL DEFAULT 'allow',
      "pathPattern" TEXT NOT NULL,
      "isAllowed" BOOLEAN NOT NULL DEFAULT 1,
      "commandDenyList" TEXT NOT NULL DEFAULT '[]',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "Agent_status_idx" ON "Agent" ("status");
    CREATE INDEX IF NOT EXISTS "Agent_type_idx" ON "Agent" ("type");
    CREATE INDEX IF NOT EXISTS "Tool_category_idx" ON "Tool" ("category");
    CREATE INDEX IF NOT EXISTS "Tool_isEnabled_idx" ON "Tool" ("isEnabled");
    CREATE INDEX IF NOT EXISTS "Skill_category_idx" ON "Skill" ("category");
    CREATE INDEX IF NOT EXISTS "Skill_isLoaded_idx" ON "Skill" ("isLoaded");
    CREATE INDEX IF NOT EXISTS "Conversation_agentId_idx" ON "Conversation" ("agentId");
    CREATE INDEX IF NOT EXISTS "Conversation_status_idx" ON "Conversation" ("status");
    CREATE INDEX IF NOT EXISTS "Conversation_createdAt_idx" ON "Conversation" ("createdAt");
    CREATE INDEX IF NOT EXISTS "Message_conversationId_idx" ON "Message" ("conversationId");
    CREATE INDEX IF NOT EXISTS "Message_createdAt_idx" ON "Message" ("createdAt");
    CREATE INDEX IF NOT EXISTS "AgentTeam_name_idx" ON "AgentTeam" ("name");
    CREATE INDEX IF NOT EXISTS "TeamMember_agentId_idx" ON "TeamMember" ("agentId");
    CREATE INDEX IF NOT EXISTS "Task_agentId_idx" ON "Task" ("agentId");
    CREATE INDEX IF NOT EXISTS "Task_teamId_idx" ON "Task" ("teamId");
    CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task" ("status");
    CREATE INDEX IF NOT EXISTS "Task_priority_idx" ON "Task" ("priority");
    CREATE INDEX IF NOT EXISTS "Task_createdAt_idx" ON "Task" ("createdAt");
    CREATE INDEX IF NOT EXISTS "Memory_agentId_idx" ON "Memory" ("agentId");
    CREATE INDEX IF NOT EXISTS "Memory_category_idx" ON "Memory" ("category");
    CREATE INDEX IF NOT EXISTS "PermissionRule_mode_idx" ON "PermissionRule" ("mode");
    CREATE INDEX IF NOT EXISTS "PermissionRule_pathPattern_idx" ON "PermissionRule" ("pathPattern");
  `;

  // Execute each statement separately
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      await db.$executeRawUnsafe(stmt);
    } catch (err) {
      // Ignore "already exists" errors for tables and indexes
      const msg = String(err);
      if (!msg.includes('already exists') && !msg.includes('duplicate')) {
        console.error('[DB] SQL error:', stmt.slice(0, 80), '→', msg);
      }
    }
  }
}

// Lightweight inline seed for Vercel cold starts
async function inlineSeed() {
  // Seed agents
  const agents = [
    { id: 'seed-alpha', name: 'Alpha', description: 'Primary code assistant specialized in writing, reviewing, and refactoring code across multiple languages.', type: 'coding', systemPrompt: 'You are Alpha, a senior coding assistant powered by OpenHarness. You excel at writing clean, efficient code, performing code reviews, debugging complex issues, and refactoring legacy codebases. Always explain your reasoning and suggest best practices. Use markdown code blocks with proper syntax highlighting.', provider: 'openai', model: 'gpt-4', status: 'active', config: JSON.stringify({ temperature: 0.3, maxTokens: 4096, topP: 0.95 }) },
    { id: 'seed-beta', name: 'Beta', description: 'Research agent specialized in web search, data analysis, and knowledge synthesis.', type: 'react', systemPrompt: 'You are Beta, a research and analysis agent powered by OpenHarness. You specialize in gathering information from the web, analyzing data, synthesizing findings, and producing comprehensive reports.', provider: 'openai', model: 'gpt-4', status: 'active', config: JSON.stringify({ temperature: 0.5, maxTokens: 4096, topP: 0.9 }) },
    { id: 'seed-gamma', name: 'Gamma', description: 'DevOps agent for CI/CD pipelines, deployment automation, and infrastructure management.', type: 'planning', systemPrompt: 'You are Gamma, a DevOps and infrastructure agent powered by OpenHarness. You specialize in CI/CD pipeline configuration, deployment automation, Docker/container management, cloud infrastructure, and monitoring.', provider: 'openai', model: 'gpt-4', status: 'active', config: JSON.stringify({ temperature: 0.2, maxTokens: 4096, topP: 0.95 }) },
  ];
  for (const agent of agents) {
    await db.agent.upsert({
      where: { id: agent.id },
      update: agent,
      create: agent,
    });
  }

  // Seed tools
  const tools = [
    { name: 'Bash', description: 'Execute shell commands in a persistent environment with optional timeout.', category: 'file', permissionMode: 'restricted', inputSchema: JSON.stringify({ type: 'object', properties: { command: { type: 'string' }, timeout: { type: 'number' } }, required: ['command'] }) },
    { name: 'Read', description: 'Read file contents from the local filesystem.', category: 'file', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }) },
    { name: 'Write', description: 'Write content to a file.', category: 'file', permissionMode: 'restricted', inputSchema: JSON.stringify({ type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }) },
    { name: 'Edit', description: 'Perform exact string replacements in existing files.', category: 'file', permissionMode: 'restricted', inputSchema: JSON.stringify({ type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }) },
    { name: 'Glob', description: 'Fast file pattern matching tool using glob patterns.', category: 'file', permissionMode: 'open', inputSchema: '{}' },
    { name: 'Grep', description: 'Powerful search tool built on ripgrep with regex support.', category: 'file', permissionMode: 'open', inputSchema: '{}' },
    { name: 'WebSearch', description: 'Search the web for real-time information.', category: 'search', permissionMode: 'open', inputSchema: '{}' },
    { name: 'WebFetch', description: 'Extract content from web pages.', category: 'search', permissionMode: 'open', inputSchema: '{}' },
    { name: 'Agent', description: 'Spawn sub-agents for parallel task execution.', category: 'agent', permissionMode: 'open', inputSchema: '{}' },
    { name: 'TaskCreate', description: 'Create a new background task.', category: 'task', permissionMode: 'open', inputSchema: '{}' },
    { name: 'TaskList', description: 'List and filter background tasks.', category: 'task', permissionMode: 'open', inputSchema: '{}' },
    { name: 'Skill', description: 'Load, invoke, or manage agent skills.', category: 'meta', permissionMode: 'open', inputSchema: '{}' },
    { name: 'MCPTool', description: 'Execute a tool via Model Context Protocol.', category: 'mcp', permissionMode: 'sandboxed', inputSchema: '{}' },
    { name: 'Config', description: 'Read and update agent configuration.', category: 'meta', permissionMode: 'restricted', inputSchema: '{}' },
  ];
  for (const tool of tools) {
    await db.tool.upsert({
      where: { name: tool.name },
      update: tool,
      create: { ...tool, isEnabled: true },
    });
  }

  // Seed skills
  const skills = [
    { id: 'seed-skill-commit', name: 'commit', description: 'Git commit workflow: stage changes, write conventional commit messages, and push.', content: '# Git Commit Skill\n\n## Workflow\n1. Run `git status` to see changes\n2. Write a conventional commit message\n3. Run `git add` and `git commit`', category: 'development' },
    { id: 'seed-skill-review', name: 'review', description: 'Code review skill for bugs, style, performance, and security.', content: '# Code Review\n\n## Checklist\n- Logic errors\n- Input validation\n- Performance\n- Security', category: 'development' },
    { id: 'seed-skill-debug', name: 'debug', description: 'Systematic debugging: reproduce, isolate, identify root cause, and fix.', content: '# Debug\n\n1. Reproduce\n2. Trace\n3. Fix\n4. Verify', category: 'development' },
    { id: 'seed-skill-web-search', name: 'web-search', description: 'Advanced web research with query formulation and source evaluation.', content: '# Web Search\n\nFormulate effective queries and cross-reference sources.', category: 'research' },
    { id: 'seed-skill-summarize', name: 'summarize', description: 'Text summarization for documents and conversations.', content: '# Summarization\n\nProvide concise summaries preserving key information.', category: 'communication' },
    { id: 'seed-skill-plan', name: 'plan', description: 'Project planning for breaking down complex tasks.', content: '# Planning\n\nBreak down tasks into phases with milestones.', category: 'development' },
  ];
  for (const skill of skills) {
    await db.skill.upsert({
      where: { id: skill.id },
      update: skill,
      create: { ...skill, isLoaded: false },
    });
  }

  // Seed teams
  const teams = [
    { id: 'seed-team-alpha', name: 'Code Review Squad', description: 'Specialized team for thorough code reviews.', config: JSON.stringify({ collaborationMode: 'sequential', maxAgents: 5 }) },
    { id: 'seed-team-beta', name: 'Research Collective', description: 'Multi-agent team for research tasks.', config: JSON.stringify({ collaborationMode: 'parallel', maxAgents: 8 }) },
    { id: 'seed-team-delta', name: 'DevOps Pipeline', description: 'Automation team for CI/CD and infrastructure.', config: JSON.stringify({ collaborationMode: 'pipeline', maxAgents: 6 }) },
  ];
  for (const team of teams) {
    await db.agentTeam.upsert({ where: { id: team.id }, update: team, create: team });
  }

  // Seed team members
  const members = [
    { teamId: 'seed-team-alpha', agentId: 'seed-alpha', role: 'leader' },
    { teamId: 'seed-team-beta', agentId: 'seed-beta', role: 'leader' },
    { teamId: 'seed-team-delta', agentId: 'seed-gamma', role: 'leader' },
  ];
  for (const member of members) {
    await db.teamMember.upsert({
      where: { teamId_agentId: { teamId: member.teamId, agentId: member.agentId } },
      update: { role: member.role },
      create: member,
    });
  }

  // Seed tasks
  const tasks = [
    { id: 'seed-task-1', agentId: 'seed-alpha', title: 'Code Review for PR #234', description: 'Review pull request #234.', status: 'in_progress', priority: 'high', progress: 75 },
    { id: 'seed-task-2', agentId: 'seed-beta', title: 'Research Web Frameworks 2025', description: 'Compare latest web frameworks.', status: 'in_progress', priority: 'medium', progress: 55 },
    { id: 'seed-task-3', agentId: 'seed-gamma', title: 'Database Migration Script', description: 'Create migration for user preferences schema.', status: 'completed', priority: 'high', progress: 100, result: JSON.stringify({ status: 'success', tablesMigrated: 3 }) },
    { id: 'seed-task-4', agentId: 'seed-alpha', title: 'Update Dependencies', description: 'Update project dependencies.', status: 'completed', priority: 'low', progress: 100, result: JSON.stringify({ status: 'success', packagesUpdated: 14 }) },
    { id: 'seed-task-5', agentId: 'seed-gamma', title: 'Deploy to Staging', description: 'Deploy latest release to staging.', status: 'failed', priority: 'high', progress: 60 },
    { id: 'seed-task-6', title: 'Performance Benchmark', description: 'Run performance benchmarks.', status: 'pending', priority: 'low', progress: 0 },
  ];
  for (const task of tasks) {
    await db.task.upsert({
      where: { id: task.id },
      update: task,
      create: { ...task, teamId: null },
    });
  }

  // Seed permissions
  const rules = [
    { id: 'seed-rule-1', mode: 'allow', pathPattern: '/src/**', isAllowed: true, commandDenyList: '[]' },
    { id: 'seed-rule-2', mode: 'deny', pathPattern: '/.env*', isAllowed: false, commandDenyList: '[]' },
    { id: 'seed-rule-3', mode: 'deny', pathPattern: '/node_modules/**', isAllowed: false, commandDenyList: '[]' },
    { id: 'seed-rule-4', mode: 'ask', pathPattern: '/prisma/schema.prisma', isAllowed: true, commandDenyList: '[]' },
    { id: 'seed-rule-5', mode: 'deny', pathPattern: '/**/*.log', isAllowed: false, commandDenyList: JSON.stringify(['rm -rf /', 'DROP TABLE', 'sudo rm -rf']) },
    { id: 'seed-rule-6', mode: 'allow', pathPattern: '/public/**', isAllowed: true, commandDenyList: '[]' },
  ];
  for (const rule of rules) {
    await db.permissionRule.upsert({ where: { id: rule.id }, update: rule, create: rule });
  }
}

// Auto-init on module load (non-blocking)
ensureDatabase();
