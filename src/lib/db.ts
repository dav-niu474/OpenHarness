// =============================================================================
// OpenHarness Database Layer - Dual Backend (SQLite + Postgres)
// =============================================================================
// - Local dev: Prisma + SQLite (unchanged)
// - Vercel with POSTGRES_URL: Neon Postgres via @neondatabase/serverless
// - Vercel without Postgres: Falls back to SQLite in /tmp
// =============================================================================

import { PrismaClient } from '@prisma/client'
import { Pool } from '@neondatabase/serverless'

// ─── 1. Environment Detection ────────────────────────────────────────────────

const POSTGRES_URL = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL
const usePostgres = !!POSTGRES_URL

// ─── 2. SQLite (Prisma) Client ──────────────────────────────────────────────

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const isVercel = !!process.env.VERCEL;
  const dbUrl = isVercel
    ? 'file:/tmp/prisma-custom.db'
    : (process.env.DATABASE_URL || 'file:./db/custom.db');

  return new PrismaClient({
    datasourceUrl: dbUrl,
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  });
}

const prismaDb =
  globalForPrisma.prisma ??
  createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaDb

// ─── 3. Postgres Connection (lazy) ─────────────────────────────────────────

let _pgPool: Pool | null = null

function getPgPool(): Pool {
  if (!_pgPool) {
    _pgPool = new Pool({ connectionString: POSTGRES_URL!, max: 5 })
  }
  return _pgPool
}

// ─── 4. SQL Helper Functions ────────────────────────────────────────────────

function generateId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 13)
  const ctr = (Math.random() * 16777215 | 0).toString(36)
  return `c${ts}${rand}${ctr}`.slice(0, 25)
}

function buildWhereClause(
  where: Record<string, any> | undefined,
  startIdx: number,
): { clause: string; params: any[]; nextIdx: number } {
  if (!where || Object.keys(where).length === 0) {
    return { clause: '', params: [], nextIdx: startIdx }
  }

  const conditions: string[] = []
  const params: any[] = []
  let idx = startIdx

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue

    if (value !== null && typeof value === 'object' && !Array.isArray(value) && 'in' in value) {
      conditions.push(`"${key}" = ANY($${idx}::text[])`)
      params.push(value.in)
      idx++
    } else if (value === null) {
      conditions.push(`"${key}" IS NULL`)
    } else {
      conditions.push(`"${key}" = $${idx}`)
      params.push(value)
      idx++
    }
  }

  return {
    clause: conditions.length > 0 ? conditions.join(' AND ') : '',
    params,
    nextIdx: idx,
  }
}

function buildOrderByClause(orderBy: any): string {
  if (!orderBy) return ''
  if (Array.isArray(orderBy)) {
    return orderBy
      .map((o: any) => {
        const [key, dir] = Object.entries(o)[0] as [string, string]
        return `"${key}" ${dir === 'desc' ? 'DESC' : 'ASC'}`
      })
      .join(', ')
  }
  const [key, dir] = Object.entries(orderBy)[0] as [string, string]
  return `"${key}" ${dir === 'desc' ? 'DESC' : 'ASC'}`
}

// Parse the `where` from an upsert to determine ON CONFLICT target
function parseUpsertWhere(where: Record<string, any>): {
  conflictTarget: string[]
  lookupParams: any[]
  lookupClause: string
} {
  const entries = Object.entries(where)
  if (entries.length === 1 && !typeof entries[0][1] === 'object') {
    const [key, value] = entries[0]
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Compound key like { teamId_agentId: { teamId: '...', agentId: '...' } }
      const compoundKeys = Object.keys(value)
      const conflictTarget = compoundKeys.map(k => `"${k}"`)
      const lookupParams = compoundKeys.map(k => value[k])
      const lookupClause = compoundKeys.map((k, i) => `"${k}" = $${i + 1}`).join(' AND ')
      return { conflictTarget, lookupParams, lookupClause }
    }
  }

  // Simple key like { id: '...' } or { name: '...' }
  const [key, value] = entries[0]
  return {
    conflictTarget: [`"${key}"`],
    lookupParams: [value],
    lookupClause: `"${key}" = $1`,
  }
}

// ─── 5. Postgres CREATE TABLE DDL ───────────────────────────────────────────

const PG_CREATE_TABLES_SQL = `
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
  "soulPrompt" TEXT NOT NULL DEFAULT '',
  "agentMd" TEXT NOT NULL DEFAULT '',
  "boundSkills" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "Tool" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'system',
  "inputSchema" TEXT NOT NULL DEFAULT '{}',
  "permissionMode" TEXT NOT NULL DEFAULT 'open',
  "isEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "Skill" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "isLoaded" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "Conversation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "agentId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'New Conversation',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Conversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "Message" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "thinking" TEXT NOT NULL DEFAULT '',
  "toolCalls" TEXT NOT NULL DEFAULT '[]',
  "toolResults" TEXT NOT NULL DEFAULT '[]',
  "tokenCount" INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "AgentTeam" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "config" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "TeamMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "teamId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'worker',
  CONSTRAINT "TeamMember_teamId_agentId_key" UNIQUE ("teamId", "agentId"),
  CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AgentTeam" ("id") ON DELETE CASCADE,
  CONSTRAINT "TeamMember_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE
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
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Task_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL,
  CONSTRAINT "Task_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "AgentTeam" ("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "Memory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "agentId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'context',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT "Memory_agentId_key_key" UNIQUE ("agentId", "key"),
  CONSTRAINT "Memory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "PermissionRule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "mode" TEXT NOT NULL DEFAULT 'allow',
  "pathPattern" TEXT NOT NULL,
  "isAllowed" BOOLEAN NOT NULL DEFAULT TRUE,
  "commandDenyList" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
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
`

// Count relation map: model -> relation -> { table, foreignKey }
const COUNT_MAP: Record<string, Record<string, { table: string; fk: string }>> = {
  Agent: {
    conversations: { table: 'Conversation', fk: 'agentId' },
    tasks: { table: 'Task', fk: 'agentId' },
    memories: { table: 'Memory', fk: 'agentId' },
    teamMemberships: { table: 'TeamMember', fk: 'agentId' },
  },
  Conversation: {
    messages: { table: 'Message', fk: 'conversationId' },
  },
  AgentTeam: {
    members: { table: 'TeamMember', fk: 'teamId' },
    tasks: { table: 'Task', fk: 'teamId' },
  },
}

// ─── 6. Postgres DB Object ──────────────────────────────────────────────────

function createPostgresDb() {
  const pool = () => getPgPool()

  // Helper: add _count subqueries to SELECT
  function addCountSelects(
    table: string,
    countSelect: Record<string, boolean> | undefined,
  ): { sqlParts: string[]; aliasMap: Record<string, string> } {
    if (!countSelect) return { sqlParts: [], aliasMap: {} }
    const sqlParts: string[] = []
    const aliasMap: Record<string, string> = {}
    const relations = COUNT_MAP[table]
    if (!relations) return { sqlParts: [], aliasMap: {} }

    for (const [rel] of Object.entries(countSelect)) {
      const mapping = relations[rel]
      if (mapping) {
        const alias = `__count_${rel}`
        sqlParts.push(
          `(SELECT COUNT(*) FROM "${mapping.table}" WHERE "${mapping.table}"."${mapping.fk}" = "${table}"."id") as "${alias}"`,
        )
        aliasMap[rel] = alias
      }
    }
    return { sqlParts, aliasMap }
  }

  // Helper: transform a raw row to include _count object
  function applyCountTransform(
    row: any,
    aliasMap: Record<string, string>,
  ): any {
    if (Object.keys(aliasMap).length === 0) return row
    const result = { ...row }
    const _count: Record<string, number> = {}
    for (const [rel, alias] of Object.entries(aliasMap)) {
      _count[rel] = Number(row[alias]) || 0
      delete result[alias]
    }
    result._count = _count
    return result
  }

  // ── Agent Model ────────────────────────────────────────────────────────
  const agent = {
    async findUnique(args?: any) {
      const { where, include } = args || {}
      const p = pool()
      const selectExtra: string[] = []
      const aliasMap: Record<string, string> = {}

      // _count
      if (include?._count?.select) {
        const cs = addCountSelects('Agent', include._count.select)
        selectExtra.push(...cs.sqlParts)
        Object.assign(aliasMap, cs.aliasMap)
      }

      // tasks (array relation with optional take)
      let tasksTake = include?.tasks?.take
      let tasksOrderBy = include?.tasks?.orderBy ? buildOrderByClause(include.tasks.orderBy) : '"createdAt" DESC'

      const extraSelect = selectExtra.length > 0 ? ', ' + selectExtra.join(', ') : ''
      const sql = `SELECT "Agent".*${extraSelect} FROM "Agent" WHERE "Agent"."id" = $1 LIMIT 1`
      const result = await p.query(sql, [where.id])
      if (result.rows.length === 0) return null

      let row = result.rows[0]

      // tasks include
      if (include?.tasks) {
        const taskTake = tasksTake ? ` LIMIT ${tasksTake}` : ''
        const taskSql = `SELECT * FROM "Task" WHERE "Task"."agentId" = $1 ORDER BY ${tasksOrderBy}${taskTake}`
        const taskResult = await p.query(taskSql, [where.id])
        row.tasks = taskResult.rows
      }

      return applyCountTransform(row, aliasMap)
    },

    async findMany(args?: any) {
      const { where, orderBy, take, include } = args || {}
      const p = pool()
      const params: any[] = []
      const selectExtra: string[] = []
      const aliasMap: Record<string, string> = {}

      if (include?._count?.select) {
        const cs = addCountSelects('Agent', include._count.select)
        selectExtra.push(...cs.sqlParts)
        Object.assign(aliasMap, cs.aliasMap)
      }

      let idx = 1
      const { clause, params: wParams, nextIdx } = buildWhereClause(where, idx)
      params.push(...wParams)
      idx = nextIdx

      const extraSelect = selectExtra.length > 0 ? ', ' + selectExtra.join(', ') : ''
      let sql = `SELECT "Agent".*${extraSelect} FROM "Agent"`
      if (clause) sql += ` WHERE ${clause}`
      if (orderBy) sql += ` ORDER BY ${buildOrderByClause(orderBy)}`
      if (take) sql += ` LIMIT ${take}`

      const result = await p.query(sql, params)
      return result.rows.map((row: any) => applyCountTransform(row, aliasMap))
    },

    async create(args: any) {
      const { data } = args
      const p = pool()
      const id = data.id || generateId()
      const sql = `INSERT INTO "Agent" ("id", "name", "description", "type", "systemPrompt", "provider", "model", "status", "config", "soulPrompt", "agentMd", "boundSkills", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        RETURNING *`
      const result = await p.query(sql, [
        id, data.name, data.description || null, data.type || 'react',
        data.systemPrompt, data.provider || 'openai', data.model || 'gpt-4',
        data.status || 'active', data.config || '{}', data.soulPrompt || '',
        data.agentMd || '', data.boundSkills || '[]',
      ])
      return result.rows[0]
    },

    async update(args: any) {
      const { where, data } = args
      const p = pool()
      const sets: string[] = []
      const params: any[] = []
      let idx = 1
      for (const [key, value] of Object.entries(data)) {
        sets.push(`"${key}" = $${idx}`)
        params.push(value)
        idx++
      }
      sets.push(`"updatedAt" = NOW()`)
      params.push(where.id)
      const sql = `UPDATE "Agent" SET ${sets.join(', ')} WHERE "id" = $${idx} RETURNING *`
      const result = await p.query(sql, params)
      return result.rows[0]
    },

    async delete(args: any) {
      const { where } = args
      const p = pool()
      const result = await p.query(`DELETE FROM "Agent" WHERE "id" = $1 RETURNING *`, [where.id])
      return result.rows[0]
    },

    async count(args?: any) {
      const p = pool()
      const { clause, params } = buildWhereClause(args?.where, 1)
      const sql = `SELECT COUNT(*) as count FROM "Agent"${clause ? ` WHERE ${clause}` : ''}`
      const result = await p.query(sql, params)
      return Number(result.rows[0].count)
    },

    async groupBy(args: any) {
      const { by, _count } = args
      const p = pool()
      const byCol = by[0]
      const countCol = _count ? Object.keys(_count.select)[0] : byCol
      const sql = `SELECT "${byCol}", COUNT(*) as cnt FROM "Agent" GROUP BY "${byCol}"`
      const result = await p.query(sql)
      return result.rows.map((row: any) => ({
        [byCol]: row[byCol],
        _count: { [countCol]: Number(row.cnt) },
      }))
    },

    async upsert(args: any) {
      const { where, update, create } = args
      const p = pool()
      const id = create.id || where.id || generateId()
      const sql = `INSERT INTO "Agent" ("id", "name", "description", "type", "systemPrompt", "provider", "model", "status", "config", "soulPrompt", "agentMd", "boundSkills", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        ON CONFLICT ("id") DO UPDATE SET "name" = $2, "description" = $3, "type" = $4, "systemPrompt" = $5, "provider" = $6, "model" = $7, "status" = $8, "config" = $9, "soulPrompt" = $10, "agentMd" = $11, "boundSkills" = $12, "updatedAt" = NOW()
        RETURNING *`
      const vals = [
        id, create.name || update.name, create.description ?? update.description ?? null,
        create.type || update.type || 'react', create.systemPrompt || update.systemPrompt,
        create.provider || update.provider || 'openai', create.model || update.model || 'gpt-4',
        create.status || update.status || 'active', create.config || update.config || '{}',
        create.soulPrompt || update.soulPrompt || '', create.agentMd || update.agentMd || '',
        create.boundSkills || update.boundSkills || '[]',
      ]
      const result = await p.query(sql, vals)
      return result.rows[0]
    },
  }

  // ── Conversation Model ────────────────────────────────────────────────
  const conversation = {
    async findUnique(args?: any) {
      const { where, include } = args || {}
      const p = pool()
      const selectExtra: string[] = []
      const aliasMap: Record<string, string> = {}

      // _count
      if (include?._count?.select) {
        const cs = addCountSelects('Conversation', include._count.select)
        selectExtra.push(...cs.sqlParts)
        Object.assign(aliasMap, cs.aliasMap)
      }

      // agent (single relation)
      let agentSelect = 'id, name, type, status, model'
      if (include?.agent?.select) {
        agentSelect = Object.keys(include.agent.select).join(', ')
      }
      if (include?.agent) {
        selectExtra.push(
          `row_to_json(("Agent").*) as "__agent"`,
        )
      }

      const extraSelect = selectExtra.length > 0 ? ', ' + selectExtra.join(', ') : ''
      const sql = `SELECT "Conversation".*${extraSelect} FROM "Conversation"
        ${include?.agent ? `LEFT JOIN "Agent" ON "Conversation"."agentId" = "Agent"."id"` : ''}
        WHERE "Conversation"."id" = $1 LIMIT 1`
      const result = await p.query(sql, [where.id])
      if (result.rows.length === 0) return null

      let row = result.rows[0]
      if (include?.agent) {
        row.agent = row.__agent
        delete row.__agent
      }

      // messages (array relation)
      if (include?.messages !== undefined) {
        const msgSelect = include.messages?.select
          ? Object.keys(include.messages.select).map(k => `"${k}"`).join(', ')
          : '*'
        const msgOrderBy = include.messages?.orderBy
          ? buildOrderByClause(include.messages.orderBy)
          : '"createdAt" ASC'
        const msgSql = `SELECT ${msgSelect} FROM "Message" WHERE "conversationId" = $1 ORDER BY ${msgOrderBy}`
        const msgResult = await p.query(msgSql, [where.id])
        row.messages = msgResult.rows
      }

      return applyCountTransform(row, aliasMap)
    },

    async findMany(args?: any) {
      const { where, orderBy, take, include } = args || {}
      const p = pool()
      const selectExtra: string[] = []
      const aliasMap: Record<string, string> = {}

      if (include?._count?.select) {
        const cs = addCountSelects('Conversation', include._count.select)
        selectExtra.push(...cs.sqlParts)
        Object.assign(aliasMap, cs.aliasMap)
      }

      let agentSelect = 'id, name, status'
      if (include?.agent?.select) {
        agentSelect = Object.keys(include.agent.select).join(', ')
      }
      if (include?.agent) {
        selectExtra.push(
          `(SELECT row_to_json(t) FROM (SELECT ${agentSelect} FROM "Agent" WHERE "Agent"."id" = "Conversation"."agentId") t) as "__agent"`,
        )
      }

      let idx = 1
      const { clause, params: wParams, nextIdx } = buildWhereClause(where, idx)
      const params = [...wParams]
      idx = nextIdx

      const extraSelect = selectExtra.length > 0 ? ', ' + selectExtra.join(', ') : ''
      let sql = `SELECT "Conversation".*${extraSelect} FROM "Conversation"`
      if (clause) sql += ` WHERE ${clause}`
      if (orderBy) sql += ` ORDER BY ${buildOrderByClause(orderBy)}`
      if (take) sql += ` LIMIT ${take}`

      const result = await p.query(sql, params)
      return result.rows.map((row: any) => {
        if (include?.agent) {
          row.agent = row.__agent
          delete row.__agent
        }
        return applyCountTransform(row, aliasMap)
      })
    },

    async create(args: any) {
      const { data, include } = args
      const p = pool()
      const id = data.id || generateId()
      const sql = `INSERT INTO "Conversation" ("id", "agentId", "title", "status", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`
      const result = await p.query(sql, [id, data.agentId, data.title || 'New Conversation', data.status || 'active'])
      const row = result.rows[0]

      if (include?.agent) {
        const agentSelect = include.agent.select ? Object.keys(include.agent.select).join(', ') : '*'
        const agentResult = await p.query(`SELECT ${agentSelect} FROM "Agent" WHERE "id" = $1`, [data.agentId])
        row.agent = agentResult.rows[0] || null
      }
      return row
    },

    async update(args: any) {
      const { where, data } = args
      const p = pool()
      const sets: string[] = []
      const params: any[] = []
      let idx = 1
      for (const [key, value] of Object.entries(data)) {
        sets.push(`"${key}" = $${idx}`)
        params.push(value)
        idx++
      }
      sets.push(`"updatedAt" = NOW()`)
      params.push(where.id)
      const sql = `UPDATE "Conversation" SET ${sets.join(', ')} WHERE "id" = $${idx} RETURNING *`
      const result = await p.query(sql, params)
      return result.rows[0]
    },

    async delete(args: any) {
      const { where } = args
      const p = pool()
      const result = await p.query(`DELETE FROM "Conversation" WHERE "id" = $1 RETURNING *`, [where.id])
      return result.rows[0]
    },

    async deleteMany(args?: any) {
      const p = pool()
      const { clause, params } = buildWhereClause(args?.where, 1)
      const sql = `DELETE FROM "Conversation"${clause ? ` WHERE ${clause}` : ''}`
      const result = await p.query(sql, params)
      return { count: result.rowCount || 0 }
    },

    async count(args?: any) {
      const p = pool()
      const { clause, params } = buildWhereClause(args?.where, 1)
      const sql = `SELECT COUNT(*) as count FROM "Conversation"${clause ? ` WHERE ${clause}` : ''}`
      const result = await p.query(sql, params)
      return Number(result.rows[0].count)
    },

    async upsert(args: any) {
      const { where, update, create } = args
      const p = pool()
      const id = create.id || where.id || generateId()
      const title = create.title || update.title || 'New Conversation'
      const status = create.status || update.status || 'active'
      const agentId = create.agentId || update.agentId
      const sql = `INSERT INTO "Conversation" ("id", "agentId", "title", "status", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT ("id") DO UPDATE SET "title" = $3, "status" = $4, "updatedAt" = NOW()
        RETURNING *`
      const result = await p.query(sql, [id, agentId, title, status])
      return result.rows[0]
    },
  }

  // ── Message Model ─────────────────────────────────────────────────────
  const message = {
    async create(args: any) {
      const { data } = args
      const p = pool()
      const id = data.id || generateId()
      const sql = `INSERT INTO "Message" ("id", "conversationId", "role", "content", "thinking", "toolCalls", "toolResults", "tokenCount", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`
      const result = await p.query(sql, [
        id, data.conversationId, data.role,
        data.content || '', data.thinking || '',
        data.toolCalls || '[]', data.toolResults || '[]',
        data.tokenCount || null,
      ])
      return result.rows[0]
    },

    async findMany(args?: any) {
      const { where, orderBy, take, include } = args || {}
      const p = pool()
      const selectExtra: string[] = []

      if (include?.conversation) {
        // nested: conversation.agent
        if (include.conversation.select?.agent) {
          const agentSelect = include.conversation.select.agent.select
            ? Object.keys(include.conversation.select.agent.select).join(', ')
            : '*'
          const convSelect = include.conversation.select
            ? Object.keys(include.conversation.select).filter(k => k !== 'agent').map(k => `"Conversation"."${k}"`).join(', ')
            : '*'
          selectExtra.push(
            `(SELECT row_to_json(t) FROM (
              SELECT ${convSelect ? convSelect + ', ' : ''} (SELECT row_to_json(a) FROM (SELECT ${agentSelect} FROM "Agent" WHERE "Agent"."id" = "Conversation"."agentId") a) as "agent"
              FROM "Conversation" WHERE "Conversation"."id" = "Message"."conversationId"
            ) t) as "__conversation"`,
          )
        } else {
          const convSelect = include.conversation.select
            ? Object.keys(include.conversation.select).map(k => `"Conversation"."${k}"`).join(', ')
            : '"Conversation".*'
          selectExtra.push(
            `(SELECT row_to_json(t) FROM (SELECT ${convSelect} FROM "Conversation" WHERE "Conversation"."id" = "Message"."conversationId") t) as "__conversation"`,
          )
        }
      }

      const extraSelect = selectExtra.length > 0 ? ', ' + selectExtra.join(', ') : ''
      let idx = 1
      const { clause, params: wParams, nextIdx } = buildWhereClause(where, idx)
      const params = [...wParams]
      idx = nextIdx

      let sql = `SELECT "Message".*${extraSelect} FROM "Message"`
      if (clause) sql += ` WHERE ${clause}`
      if (orderBy) sql += ` ORDER BY ${buildOrderByClause(orderBy)}`
      if (take) sql += ` LIMIT ${take}`

      const result = await p.query(sql, params)
      return result.rows.map((row: any) => {
        if (include?.conversation) {
          row.conversation = row.__conversation
          delete row.__conversation
        }
        return row
      })
    },

    async count(args?: any) {
      const p = pool()
      const { clause, params } = buildWhereClause(args?.where, 1)
      const sql = `SELECT COUNT(*) as count FROM "Message"${clause ? ` WHERE ${clause}` : ''}`
      const result = await p.query(sql, params)
      return Number(result.rows[0].count)
    },
  }

  // ── Task Model ────────────────────────────────────────────────────────
  const task = {
    async findUnique(args?: any) {
      const { where, include } = args || {}
      const p = pool()
      const selectExtra: string[] = []

      if (include?.agent) {
        const agentSelect = include.agent.select ? Object.keys(include.agent.select).join(', ') : '*'
        selectExtra.push(
          `(SELECT row_to_json(t) FROM (SELECT ${agentSelect} FROM "Agent" WHERE "Agent"."id" = "Task"."agentId") t) as "__agent"`,
        )
      }
      if (include?.team) {
        const teamSelect = include.team.select ? Object.keys(include.team.select).join(', ') : '*'
        selectExtra.push(
          `(SELECT row_to_json(t) FROM (SELECT ${teamSelect} FROM "AgentTeam" WHERE "AgentTeam"."id" = "Task"."teamId") t) as "__team"`,
        )
      }

      const extraSelect = selectExtra.length > 0 ? ', ' + selectExtra.join(', ') : ''
      const sql = `SELECT "Task".*${extraSelect} FROM "Task" WHERE "Task"."id" = $1 LIMIT 1`
      const result = await p.query(sql, [where.id])
      if (result.rows.length === 0) return null

      const row = result.rows[0]
      if (include?.agent) { row.agent = row.__agent; delete row.__agent }
      if (include?.team) { row.team = row.__team; delete row.__team }
      return row
    },

    async findMany(args?: any) {
      const { where, orderBy, take, include, select } = args || {}
      const p = pool()
      const selectExtra: string[] = []

      if (include?.agent) {
        const agentSelect = include.agent.select ? Object.keys(include.agent.select).join(', ') : '*'
        selectExtra.push(
          `(SELECT row_to_json(t) FROM (SELECT ${agentSelect} FROM "Agent" WHERE "Agent"."id" = "Task"."agentId") t) as "__agent"`,
        )
      }
      if (include?.team) {
        const teamSelect = include.team.select ? Object.keys(include.team.select).join(', ') : '*'
        selectExtra.push(
          `(SELECT row_to_json(t) FROM (SELECT ${teamSelect} FROM "AgentTeam" WHERE "AgentTeam"."id" = "Task"."teamId") t) as "__team"`,
        )
      }

      let idx = 1
      const { clause, params: wParams, nextIdx } = buildWhereClause(where, idx)
      const params = [...wParams]
      idx = nextIdx

      const colSelect = select
        ? Object.keys(select).map(k => `"${k}"`).join(', ')
        : `"Task".*`
      const extraSelect = selectExtra.length > 0 ? ', ' + selectExtra.join(', ') : ''

      let sql = `SELECT ${colSelect}${extraSelect} FROM "Task"`
      if (clause) sql += ` WHERE ${clause}`
      if (orderBy) sql += ` ORDER BY ${buildOrderByClause(orderBy)}`
      if (take) sql += ` LIMIT ${take}`

      const result = await p.query(sql, params)
      return result.rows.map((row: any) => {
        if (include?.agent) { row.agent = row.__agent; delete row.__agent }
        if (include?.team) { row.team = row.__team; delete row.__team }
        return row
      })
    },

    async create(args: any) {
      const { data, include } = args
      const p = pool()
      const id = data.id || generateId()
      const sql = `INSERT INTO "Task" ("id", "agentId", "teamId", "title", "description", "status", "priority", "progress", "result", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING *`
      const result = await p.query(sql, [
        id, data.agentId || null, data.teamId || null,
        data.title, data.description || null, data.status || 'pending',
        data.priority || 'medium', data.progress ?? 0, data.result || null,
      ])
      const row = result.rows[0]

      if (include?.agent && row.agentId) {
        const agentSelect = include.agent.select ? Object.keys(include.agent.select).join(', ') : '*'
        const agentResult = await p.query(`SELECT ${agentSelect} FROM "Agent" WHERE "id" = $1`, [row.agentId])
        row.agent = agentResult.rows[0] || null
      }
      if (include?.team && row.teamId) {
        const teamSelect = include.team.select ? Object.keys(include.team.select).join(', ') : '*'
        const teamResult = await p.query(`SELECT ${teamSelect} FROM "AgentTeam" WHERE "id" = $1`, [row.teamId])
        row.team = teamResult.rows[0] || null
      }
      return row
    },

    async update(args: any) {
      const { where, data, include } = args
      const p = pool()
      const sets: string[] = []
      const params: any[] = []
      let idx = 1
      for (const [key, value] of Object.entries(data)) {
        sets.push(`"${key}" = $${idx}`)
        params.push(value)
        idx++
      }
      sets.push(`"updatedAt" = NOW()`)
      params.push(where.id)
      const sql = `UPDATE "Task" SET ${sets.join(', ')} WHERE "id" = $${idx} RETURNING *`
      const result = await p.query(sql, params)
      const row = result.rows[0]

      if (include?.agent && row.agentId) {
        const agentSelect = include.agent.select ? Object.keys(include.agent.select).join(', ') : '*'
        const agentResult = await p.query(`SELECT ${agentSelect} FROM "Agent" WHERE "id" = $1`, [row.agentId])
        row.agent = agentResult.rows[0] || null
      }
      if (include?.team && row.teamId) {
        const teamSelect = include.team.select ? Object.keys(include.team.select).join(', ') : '*'
        const teamResult = await p.query(`SELECT ${teamSelect} FROM "AgentTeam" WHERE "id" = $1`, [row.teamId])
        row.team = teamResult.rows[0] || null
      }
      return row
    },

    async delete(args: any) {
      const { where } = args
      const p = pool()
      const result = await p.query(`DELETE FROM "Task" WHERE "id" = $1 RETURNING *`, [where.id])
      return result.rows[0]
    },

    async count(args?: any) {
      const p = pool()
      const { clause, params } = buildWhereClause(args?.where, 1)
      const sql = `SELECT COUNT(*) as count FROM "Task"${clause ? ` WHERE ${clause}` : ''}`
      const result = await p.query(sql, params)
      return Number(result.rows[0].count)
    },

    async groupBy(args: any) {
      const { by, _count } = args
      const p = pool()
      const byCol = by[0]
      const countCol = _count ? Object.keys(_count.select)[0] : byCol
      const sql = `SELECT "${byCol}", COUNT(*) as cnt FROM "Task" GROUP BY "${byCol}"`
      const result = await p.query(sql)
      return result.rows.map((row: any) => ({
        [byCol]: row[byCol],
        _count: { [countCol]: Number(row.cnt) },
      }))
    },

    async upsert(args: any) {
      const { where, update, create } = args
      const p = pool()
      const id = create.id || where.id || generateId()
      const sql = `INSERT INTO "Task" ("id", "agentId", "teamId", "title", "description", "status", "priority", "progress", "result", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT ("id") DO UPDATE SET "agentId" = $2, "teamId" = $3, "title" = $4, "description" = $5, "status" = $6, "priority" = $7, "progress" = $8, "result" = $9, "updatedAt" = NOW()
        RETURNING *`
      const vals = [
        id,
        create.agentId ?? update.agentId ?? null,
        create.teamId ?? update.teamId ?? null,
        create.title || update.title,
        create.description ?? update.description ?? null,
        create.status || update.status || 'pending',
        create.priority || update.priority || 'medium',
        create.progress ?? update.progress ?? 0,
        create.result ?? update.result ?? null,
      ]
      const result = await p.query(sql, vals)
      return result.rows[0]
    },
  }

  // ── Tool Model ────────────────────────────────────────────────────────
  const tool = {
    async findMany(args?: any) {
      const { where, orderBy } = args || {}
      const p = pool()
      let idx = 1
      const { clause, params, nextIdx } = buildWhereClause(where, idx)
      let sql = `SELECT * FROM "Tool"`
      if (clause) sql += ` WHERE ${clause}`
      if (orderBy) sql += ` ORDER BY ${buildOrderByClause(orderBy)}`
      const result = await p.query(sql, params)
      return result.rows
    },

    async findUnique(args: any) {
      const p = pool()
      const result = await p.query(`SELECT * FROM "Tool" WHERE "id" = $1 LIMIT 1`, [args.where.id])
      return result.rows[0] || null
    },

    async create(args: any) {
      const { data } = args
      const p = pool()
      const id = data.id || generateId()
      const sql = `INSERT INTO "Tool" ("id", "name", "description", "category", "inputSchema", "permissionMode", "isEnabled", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *`
      const result = await p.query(sql, [
        id, data.name, data.description || null, data.category || 'system',
        data.inputSchema || '{}', data.permissionMode || 'open',
        data.isEnabled !== undefined ? data.isEnabled : true,
      ])
      return result.rows[0]
    },

    async update(args: any) {
      const { where, data } = args
      const p = pool()
      const sets: string[] = []
      const params: any[] = []
      let idx = 1
      for (const [key, value] of Object.entries(data)) {
        sets.push(`"${key}" = $${idx}`)
        params.push(value)
        idx++
      }
      params.push(where.id)
      const sql = `UPDATE "Tool" SET ${sets.join(', ')} WHERE "id" = $${idx} RETURNING *`
      const result = await p.query(sql, params)
      return result.rows[0]
    },

    async count(args?: any) {
      const p = pool()
      const { clause, params } = buildWhereClause(args?.where, 1)
      const sql = `SELECT COUNT(*) as count FROM "Tool"${clause ? ` WHERE ${clause}` : ''}`
      const result = await p.query(sql, params)
      return Number(result.rows[0].count)
    },

    async upsert(args: any) {
      const { where, update, create } = args
      const p = pool()
      const id = create.id || generateId()
      const name = create.name || update.name
      const sql = `INSERT INTO "Tool" ("id", "name", "description", "category", "inputSchema", "permissionMode", "isEnabled", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT ("name") DO UPDATE SET "description" = $3, "category" = $4, "inputSchema" = $5, "permissionMode" = $6, "isEnabled" = $7
        RETURNING *`
      const result = await p.query(sql, [
        id, name,
        create.description ?? update.description ?? null,
        create.category || update.category || 'system',
        create.inputSchema || update.inputSchema || '{}',
        create.permissionMode || update.permissionMode || 'open',
        create.isEnabled !== undefined ? create.isEnabled : (update.isEnabled !== undefined ? update.isEnabled : true),
      ])
      return result.rows[0]
    },
  }

  // ── Skill Model ───────────────────────────────────────────────────────
  const skill = {
    async findMany(args?: any) {
      const { where, orderBy } = args || {}
      const p = pool()
      let idx = 1
      const { clause, params } = buildWhereClause(where, idx)
      let sql = `SELECT * FROM "Skill"`
      if (clause) sql += ` WHERE ${clause}`
      if (orderBy) sql += ` ORDER BY ${buildOrderByClause(orderBy)}`
      const result = await p.query(sql, params)
      return result.rows
    },

    async findUnique(args: any) {
      const p = pool()
      const result = await p.query(`SELECT * FROM "Skill" WHERE "id" = $1 LIMIT 1`, [args.where.id])
      return result.rows[0] || null
    },

    async create(args: any) {
      const { data } = args
      const p = pool()
      const id = data.id || generateId()
      const sql = `INSERT INTO "Skill" ("id", "name", "description", "content", "category", "isLoaded", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`
      const result = await p.query(sql, [
        id, data.name, data.description || null, data.content,
        data.category || 'general', data.isLoaded !== undefined ? data.isLoaded : false,
      ])
      return result.rows[0]
    },

    async update(args: any) {
      const { where, data } = args
      const p = pool()
      const sets: string[] = []
      const params: any[] = []
      let idx = 1
      for (const [key, value] of Object.entries(data)) {
        sets.push(`"${key}" = $${idx}`)
        params.push(value)
        idx++
      }
      params.push(where.id)
      const sql = `UPDATE "Skill" SET ${sets.join(', ')} WHERE "id" = $${idx} RETURNING *`
      const result = await p.query(sql, params)
      return result.rows[0]
    },

    async count(args?: any) {
      const p = pool()
      const { clause, params } = buildWhereClause(args?.where, 1)
      const sql = `SELECT COUNT(*) as count FROM "Skill"${clause ? ` WHERE ${clause}` : ''}`
      const result = await p.query(sql, params)
      return Number(result.rows[0].count)
    },

    async upsert(args: any) {
      const { where, update, create } = args
      const p = pool()
      const id = create.id || where.id || generateId()
      const sql = `INSERT INTO "Skill" ("id", "name", "description", "content", "category", "isLoaded", "createdAt")
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT ("id") DO UPDATE SET "name" = $2, "description" = $3, "content" = $4, "category" = $5, "isLoaded" = $6
        RETURNING *`
      const result = await p.query(sql, [
        id, create.name || update.name,
        create.description ?? update.description ?? null,
        create.content || update.content,
        create.category || update.category || 'general',
        create.isLoaded !== undefined ? create.isLoaded : (update.isLoaded !== undefined ? update.isLoaded : false),
      ])
      return result.rows[0]
    },
  }

  // ── AgentTeam Model ───────────────────────────────────────────────────
  const agentTeam = {
    async findMany(args?: any) {
      const { where, orderBy, include } = args || {}
      const p = pool()
      const selectExtra: string[] = []

      if (include?.members) {
        // members is an array relation, each with an agent sub-relation
        if (include.members.include?.agent) {
          const agentSelect = include.members.include.agent.select
            ? Object.keys(include.members.include.agent.select).join(', ')
            : '*'
          selectExtra.push(
            `COALESCE((SELECT JSON_AGG(sub) FROM (
              SELECT "TeamMember".*, 
                (SELECT row_to_json(a) FROM (SELECT ${agentSelect} FROM "Agent" WHERE "Agent"."id" = "TeamMember"."agentId") a) as "agent"
              FROM "TeamMember" WHERE "TeamMember"."teamId" = "AgentTeam"."id"
            ) sub), '[]'::json) as "__members"`,
          )
        } else {
          selectExtra.push(
            `COALESCE((SELECT JSON_AGG("TeamMember".*) FROM "TeamMember" WHERE "TeamMember"."teamId" = "AgentTeam"."id"), '[]'::json) as "__members"`,
          )
        }
      }

      let idx = 1
      const { clause, params } = buildWhereClause(where, idx)

      const extraSelect = selectExtra.length > 0 ? ', ' + selectExtra.join(', ') : ''
      let sql = `SELECT "AgentTeam".*${extraSelect} FROM "AgentTeam"`
      if (clause) sql += ` WHERE ${clause}`
      if (orderBy) sql += ` ORDER BY ${buildOrderByClause(orderBy)}`

      const result = await p.query(sql, params)
      return result.rows.map((row: any) => {
        if (include?.members) {
          if (typeof row.__members === 'string') {
            row.members = JSON.parse(row.__members)
          } else if (Array.isArray(row.__members)) {
            row.members = row.__members
          } else {
            row.members = row.__members || []
          }
          delete row.__members
        }
        return row
      })
    },

    async findUnique(args: any) {
      const p = pool()
      const result = await p.query(`SELECT * FROM "AgentTeam" WHERE "id" = $1 LIMIT 1`, [args.where.id])
      return result.rows[0] || null
    },

    async create(args: any) {
      const { data } = args
      const p = pool()
      const id = data.id || generateId()
      const sql = `INSERT INTO "AgentTeam" ("id", "name", "description", "config", "createdAt")
        VALUES ($1, $2, $3, $4, NOW()) RETURNING *`
      const result = await p.query(sql, [
        id, data.name, data.description || null, data.config || '{}',
      ])
      return result.rows[0]
    },

    async update(args: any) {
      const { where, data } = args
      const p = pool()
      const sets: string[] = []
      const params: any[] = []
      let idx = 1
      for (const [key, value] of Object.entries(data)) {
        sets.push(`"${key}" = $${idx}`)
        params.push(value)
        idx++
      }
      params.push(where.id)
      const sql = `UPDATE "AgentTeam" SET ${sets.join(', ')} WHERE "id" = $${idx} RETURNING *`
      const result = await p.query(sql, params)
      return result.rows[0]
    },

    async delete(args: any) {
      const { where } = args
      const p = pool()
      const result = await p.query(`DELETE FROM "AgentTeam" WHERE "id" = $1 RETURNING *`, [where.id])
      return result.rows[0]
    },

    async count(args?: any) {
      const p = pool()
      const { clause, params } = buildWhereClause(args?.where, 1)
      const sql = `SELECT COUNT(*) as count FROM "AgentTeam"${clause ? ` WHERE ${clause}` : ''}`
      const result = await p.query(sql, params)
      return Number(result.rows[0].count)
    },

    async upsert(args: any) {
      const { where, update, create } = args
      const p = pool()
      const id = create.id || where.id || generateId()
      const sql = `INSERT INTO "AgentTeam" ("id", "name", "description", "config", "createdAt")
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT ("id") DO UPDATE SET "name" = $2, "description" = $3, "config" = $4
        RETURNING *`
      const result = await p.query(sql, [
        id, create.name || update.name,
        create.description ?? update.description ?? null,
        create.config || update.config || '{}',
      ])
      return result.rows[0]
    },
  }

  // ── TeamMember Model ──────────────────────────────────────────────────
  const teamMember = {
    async findMany(args?: any) {
      const { where, include } = args || {}
      const p = pool()
      const selectExtra: string[] = []

      if (include?.agent) {
        const agentSelect = include.agent.select ? Object.keys(include.agent.select).join(', ') : '*'
        selectExtra.push(
          `(SELECT row_to_json(t) FROM (SELECT ${agentSelect} FROM "Agent" WHERE "Agent"."id" = "TeamMember"."agentId") t) as "__agent"`,
        )
      }
      if (include?.team) {
        const teamSelect = include.team.select ? Object.keys(include.team.select).join(', ') : '*'
        selectExtra.push(
          `(SELECT row_to_json(t) FROM (SELECT ${teamSelect} FROM "AgentTeam" WHERE "AgentTeam"."id" = "TeamMember"."teamId") t) as "__team"`,
        )
      }

      let idx = 1
      const { clause, params } = buildWhereClause(where, idx)

      const extraSelect = selectExtra.length > 0 ? ', ' + selectExtra.join(', ') : ''
      let sql = `SELECT "TeamMember".*${extraSelect} FROM "TeamMember"`
      if (clause) sql += ` WHERE ${clause}`

      const result = await p.query(sql, params)
      return result.rows.map((row: any) => {
        if (include?.agent) { row.agent = row.__agent; delete row.__agent }
        if (include?.team) { row.team = row.__team; delete row.__team }
        return row
      })
    },

    async create(args: any) {
      const { data, include } = args
      const p = pool()
      const id = data.id || generateId()
      const sql = `INSERT INTO "TeamMember" ("id", "teamId", "agentId", "role")
        VALUES ($1, $2, $3, $4) RETURNING *`
      const result = await p.query(sql, [id, data.teamId, data.agentId, data.role || 'worker'])
      const row = result.rows[0]

      if (include?.agent) {
        const agentSelect = include.agent.select ? Object.keys(include.agent.select).join(', ') : '*'
        const agentResult = await p.query(`SELECT ${agentSelect} FROM "Agent" WHERE "id" = $1`, [data.agentId])
        row.agent = agentResult.rows[0] || null
      }
      return row
    },

    async delete(args: any) {
      const { where } = args
      const p = pool()
      const result = await p.query(`DELETE FROM "TeamMember" WHERE "id" = $1 RETURNING *`, [where.id])
      return result.rows[0]
    },

    async upsert(args: any) {
      const { where, update, create } = args
      const p = pool()
      const id = create.id || generateId()

      // Handle compound key: { teamId_agentId: { teamId, agentId } }
      let lookupWhere: Record<string, any>
      if (where.teamId_agentId) {
        lookupWhere = where.teamId_agentId
      } else {
        lookupWhere = where
      }

      const teamId = create.teamId || lookupWhere.teamId
      const agentId = create.agentId || lookupWhere.agentId
      const role = create.role || update.role || 'worker'

      const sql = `INSERT INTO "TeamMember" ("id", "teamId", "agentId", "role")
        VALUES ($1, $2, $3, $4)
        ON CONFLICT ("teamId", "agentId") DO UPDATE SET "role" = $4
        RETURNING *`
      const result = await p.query(sql, [id, teamId, agentId, role])
      return result.rows[0]
    },
  }

  // ── Memory Model ──────────────────────────────────────────────────────
  const memory = {
    async count(args?: any) {
      const p = pool()
      const { clause, params } = buildWhereClause(args?.where, 1)
      const sql = `SELECT COUNT(*) as count FROM "Memory"${clause ? ` WHERE ${clause}` : ''}`
      const result = await p.query(sql, params)
      return Number(result.rows[0].count)
    },

    async upsert(args: any) {
      const { where, update, create } = args
      const p = pool()
      const id = create.id || generateId()

      // Handle compound key: { agentId_key: { agentId, key } }
      let agentId: string, key: string
      if (where.agentId_key) {
        agentId = create.agentId || where.agentId_key.agentId
        key = create.key || where.agentId_key.key
      } else {
        agentId = create.agentId || where.agentId
        key = create.key || where.key
      }

      const sql = `INSERT INTO "Memory" ("id", "agentId", "key", "value", "category", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT ("agentId", "key") DO UPDATE SET "value" = $4, "category" = $5, "updatedAt" = NOW()
        RETURNING *`
      const result = await p.query(sql, [
        id, agentId, key,
        create.value || update.value,
        create.category || update.category || 'context',
      ])
      return result.rows[0]
    },
  }

  // ── PermissionRule Model ──────────────────────────────────────────────
  const permissionRule = {
    async findMany(args?: any) {
      const { where, orderBy } = args || {}
      const p = pool()
      let idx = 1
      const { clause, params } = buildWhereClause(where, idx)
      let sql = `SELECT * FROM "PermissionRule"`
      if (clause) sql += ` WHERE ${clause}`
      if (orderBy) sql += ` ORDER BY ${buildOrderByClause(orderBy)}`
      const result = await p.query(sql, params)
      return result.rows
    },

    async findUnique(args: any) {
      const p = pool()
      const result = await p.query(`SELECT * FROM "PermissionRule" WHERE "id" = $1 LIMIT 1`, [args.where.id])
      return result.rows[0] || null
    },

    async create(args: any) {
      const { data } = args
      const p = pool()
      const id = data.id || generateId()
      const sql = `INSERT INTO "PermissionRule" ("id", "mode", "pathPattern", "isAllowed", "commandDenyList", "createdAt")
        VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`
      const result = await p.query(sql, [
        id, data.mode || 'allow', data.pathPattern,
        data.isAllowed !== undefined ? data.isAllowed : true,
        data.commandDenyList || '[]',
      ])
      return result.rows[0]
    },

    async update(args: any) {
      const { where, data } = args
      const p = pool()
      const sets: string[] = []
      const params: any[] = []
      let idx = 1
      for (const [key, value] of Object.entries(data)) {
        sets.push(`"${key}" = $${idx}`)
        params.push(value)
        idx++
      }
      params.push(where.id)
      const sql = `UPDATE "PermissionRule" SET ${sets.join(', ')} WHERE "id" = $${idx} RETURNING *`
      const result = await p.query(sql, params)
      return result.rows[0]
    },

    async delete(args: any) {
      const { where } = args
      const p = pool()
      const result = await p.query(`DELETE FROM "PermissionRule" WHERE "id" = $1 RETURNING *`, [where.id])
      return result.rows[0]
    },

    async count(args?: any) {
      const p = pool()
      const { clause, params } = buildWhereClause(args?.where, 1)
      const sql = `SELECT COUNT(*) as count FROM "PermissionRule"${clause ? ` WHERE ${clause}` : ''}`
      const result = await p.query(sql, params)
      return Number(result.rows[0].count)
    },

    async upsert(args: any) {
      const { where, update, create } = args
      const p = pool()
      const id = create.id || where.id || generateId()
      const sql = `INSERT INTO "PermissionRule" ("id", "mode", "pathPattern", "isAllowed", "commandDenyList", "createdAt")
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT ("id") DO UPDATE SET "mode" = $2, "pathPattern" = $3, "isAllowed" = $4, "commandDenyList" = $5
        RETURNING *`
      const result = await p.query(sql, [
        id, create.mode || update.mode || 'allow',
        create.pathPattern || update.pathPattern,
        create.isAllowed !== undefined ? create.isAllowed : (update.isAllowed !== undefined ? update.isAllowed : true),
        create.commandDenyList || update.commandDenyList || '[]',
      ])
      return result.rows[0]
    },
  }

  // ── Raw query methods ─────────────────────────────────────────────────
  return {
    agent,
    conversation,
    message,
    task,
    tool,
    skill,
    agentTeam,
    teamMember,
    memory,
    permissionRule,

    async $queryRawUnsafe(query: string, ...params: any[]): Promise<any[]> {
      const result = await pool().query(query, params)
      return result.rows
    },

    async $executeRawUnsafe(query: string, ...params: any[]): Promise<any> {
      const result = await pool().query(query, params)
      return result
    },
  }
}

// ─── 7. Unified DB Export ───────────────────────────────────────────────────

export const db: any = usePostgres ? createPostgresDb() : prismaDb

// ─── 8. Database Initialization ─────────────────────────────────────────────

// Auto-initialize database on first import (especially for Vercel)
let initialized = false
let initPromise: Promise<void> | null = null

export async function ensureDatabase(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (usePostgres) {
      // ── Postgres initialization ──
      try {
        // Check if Agent table exists
        const result = await db.$queryRawUnsafe(
          `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Agent'`
        ) as Array<{ table_name: string }>

        if (result.length === 0) {
          console.log('[DB] Postgres: No tables found, creating schema...')
          await createTables()
          console.log('[DB] Postgres: Schema created, seeding...')
          await inlineSeed()
          console.log('[DB] Postgres: Initialization complete')
        } else {
          // Check schema version by looking for new columns
          const cols = await db.$queryRawUnsafe(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'Agent' AND table_schema = 'public'`
          ) as Array<{ column_name: string }>
          const columnNames = cols.map(c => c.column_name)
          const hasNewColumns = columnNames.includes('soulPrompt') && columnNames.includes('agentMd') && columnNames.includes('boundSkills')

          if (!hasNewColumns) {
            console.log('[DB] Postgres: Schema outdated, dropping and recreating all tables...')
            await dropAllTables()
            await createTables()
            console.log('[DB] Postgres: Schema recreated, seeding...')
            await inlineSeed()
            console.log('[DB] Postgres: Initialization complete')
          } else {
            // Schema is current — check if data needs seeding
            try {
              const agentCount = await db.agent.count()
              if (agentCount === 0) {
                console.log('[DB] Postgres: Tables exist but no data, seeding...')
                await inlineSeed()
                console.log('[DB] Postgres: Seeding complete')
              } else {
                console.log(`[DB] Postgres: Found ${agentCount} agents, ready`)
              }
            } catch {
              console.log('[DB] Postgres: Table check failed, recreating...')
              await dropAllTables()
              await createTables()
              await inlineSeed()
            }
          }
        }
      } catch (err) {
        console.error('[DB] Postgres auto-init failed:', err)
      }
    } else if (process.env.VERCEL) {
      // ── SQLite on Vercel initialization ──
      try {
        const result = await db.$queryRawUnsafe(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='Agent'"
        ) as Array<{ name: string }>

        if (result.length === 0) {
          console.log('[DB] Vercel: No tables found, creating schema...')
          await createTables()
          console.log('[DB] Vercel: Schema created, seeding...')
          await inlineSeed()
          console.log('[DB] Vercel: Initialization complete')
        } else {
          const columns = await db.$queryRawUnsafe(
            "PRAGMA table_info(\"Agent\")"
          ) as Array<{ name: string }>;
          const columnNames = columns.map(c => c.name);
          const hasNewColumns = columnNames.includes('soulPrompt') && columnNames.includes('agentMd') && columnNames.includes('boundSkills')

          if (!hasNewColumns) {
            console.log('[DB] Vercel: Schema outdated, dropping and recreating all tables...')
            await dropAllTables()
            await createTables()
            console.log('[DB] Vercel: Schema recreated, seeding...')
            await inlineSeed()
            console.log('[DB] Vercel: Initialization complete')
          } else {
            try {
              const agentCount = await db.agent.count()
              if (agentCount === 0) {
                console.log('[DB] Vercel: Tables exist but no data, seeding...')
                await inlineSeed()
                console.log('[DB] Vercel: Seeding complete')
              } else {
                console.log(`[DB] Vercel: Found ${agentCount} agents, ready`)
              }
            } catch {
              console.log('[DB] Vercel: Table check failed, recreating...')
              await dropAllTables()
              await createTables()
              await inlineSeed()
            }
          }
        }
      } catch (err) {
        console.error('[DB] Vercel auto-init failed:', err)
      }
    }
    initialized = true;
  })();

  return initPromise;
}

// ─── 9. Table Management ────────────────────────────────────────────────────

async function dropAllTables() {
  const tables = ['Message', 'TeamMember', 'Task', 'Memory', 'Conversation', 'PermissionRule', 'AgentTeam', 'Tool', 'Skill', 'Agent']
  for (const table of tables) {
    try {
      await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}" CASCADE`)
    } catch {
      // ignore
    }
  }
}

async function createTables() {
  if (usePostgres) {
    // Postgres: execute the Postgres-compatible DDL
    const statements = PG_CREATE_TABLES_SQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    for (const stmt of statements) {
      try {
        await db.$executeRawUnsafe(stmt)
      } catch (err) {
        const msg = String(err)
        if (!msg.includes('already exists') && !msg.includes('duplicate')) {
          console.error('[DB] Postgres SQL error:', stmt.slice(0, 80), '→', msg)
        }
      }
    }
  } else {
    // SQLite: execute SQLite-compatible DDL
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
      "soulPrompt" TEXT NOT NULL DEFAULT '',
      "agentMd" TEXT NOT NULL DEFAULT '',
      "boundSkills" TEXT NOT NULL DEFAULT '[]',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "Tool" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL UNIQUE,
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
      "thinking" TEXT NOT NULL DEFAULT '',
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
  `

    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      try {
        await db.$executeRawUnsafe(stmt);
      } catch (err) {
        const msg = String(err);
        if (!msg.includes('already exists') && !msg.includes('duplicate')) {
          console.error('[DB] SQL error:', stmt.slice(0, 80), '→', msg);
        }
      }
    }
  }
}

// ─── 10. Seeding ────────────────────────────────────────────────────────────
// Uses db.xxx.upsert which works for BOTH backends

async function inlineSeed() {
  // Seed agents
  const agents = [
    { id: 'seed-alpha', name: 'Alpha', description: 'Primary code assistant specialized in writing, reviewing, and refactoring code across multiple languages.', type: 'coding', systemPrompt: 'You are Alpha, a senior coding assistant powered by OpenHarness. You excel at writing clean, efficient code, performing code reviews, debugging complex issues, and refactoring legacy codebases. Always explain your reasoning and suggest best practices. Use markdown code blocks with proper syntax highlighting.', provider: 'nvidia', model: 'z-ai/glm4.7', status: 'active', config: JSON.stringify({ temperature: 0.3, maxTokens: 4096, topP: 0.95 }), soulPrompt: 'You are a meticulous and patient coding expert. You take pride in writing elegant, well-structured code. You always double-check your work.', agentMd: '# Alpha - Code Assistant\n\n## Capabilities\n- Code writing, review, and refactoring\n- Multi-language support (TypeScript, Python, Rust, Go)\n- Debugging and performance optimization\n- Architecture design and best practices', boundSkills: JSON.stringify(['seed-skill-commit', 'seed-skill-review', 'seed-skill-debug']) },
    { id: 'seed-beta', name: 'Beta', description: 'Research agent specialized in web search, data analysis, and knowledge synthesis.', type: 'react', systemPrompt: 'You are Beta, a research and analysis agent powered by OpenHarness. You specialize in gathering information from the web, analyzing data, synthesizing findings, and producing comprehensive reports.', provider: 'nvidia', model: 'z-ai/glm4.7', status: 'active', config: JSON.stringify({ temperature: 0.5, maxTokens: 4096, topP: 0.9 }), soulPrompt: 'You are naturally curious and thorough in your research. You always verify facts from multiple sources and present balanced, well-researched conclusions.', agentMd: '# Beta - Research Agent\n\n## Capabilities\n- Web search and information gathering\n- Data analysis and synthesis\n- Report generation\n- Source evaluation and fact-checking', boundSkills: JSON.stringify(['seed-skill-web-search', 'seed-skill-summarize', 'seed-skill-plan']) },
    { id: 'seed-gamma', name: 'Gamma', description: 'DevOps agent for CI/CD pipelines, deployment automation, and infrastructure management.', type: 'planning', systemPrompt: 'You are Gamma, a DevOps and infrastructure agent powered by OpenHarness. You specialize in CI/CD pipeline configuration, deployment automation, Docker/container management, cloud infrastructure, and monitoring.', provider: 'nvidia', model: 'z-ai/glm4.7', status: 'active', config: JSON.stringify({ temperature: 0.2, maxTokens: 4096, topP: 0.95 }), soulPrompt: 'You are methodical and safety-conscious. You always plan infrastructure changes carefully, test thoroughly, and follow infrastructure-as-code best practices.', agentMd: '# Gamma - DevOps Agent\n\n## Capabilities\n- CI/CD pipeline configuration\n- Container orchestration (Docker, K8s)\n- Cloud infrastructure management\n- Monitoring and alerting', boundSkills: JSON.stringify(['seed-skill-plan']) },
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

// ─── 11. Auto-init on module load (non-blocking) ────────────────────────────

ensureDatabase()
