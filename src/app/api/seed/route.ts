import { NextResponse } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/seed - Check seed status
export async function GET() {
  try {
    await ensureDatabase();
    const agentCount = await db.agent.count();
    const toolCount = await db.tool.count();
    const skillCount = await db.skill.count();
    const taskCount = await db.task.count();
    const teamCount = await db.agentTeam.count();
    const ruleCount = await db.permissionRule.count();

    return NextResponse.json({
      success: true,
      data: {
        message: 'Database is ready',
        counts: { agents: agentCount, tools: toolCount, skills: skillCount, tasks: taskCount, teams: teamCount, permissionRules: ruleCount },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    await ensureDatabase();
    const results: Record<string, number> = {};

    // =========================================================================
    // AGENTS - Create 3 agents using upsert (idempotent by name uniqueness)
    // =========================================================================
    const agents = [
      {
        name: 'Alpha',
        description: 'Primary code assistant specialized in writing, reviewing, and refactoring code across multiple languages.',
        type: 'coding',
        systemPrompt: 'You are Alpha, a senior coding assistant powered by OpenHarness. You excel at writing clean, efficient code, performing code reviews, debugging complex issues, and refactoring legacy codebases. Always explain your reasoning and suggest best practices. Use markdown code blocks with proper syntax highlighting.',
        provider: 'nvidia',
        model: 'z-ai/glm4.7',
        status: 'active',
        config: JSON.stringify({ temperature: 0.3, maxTokens: 4096, topP: 0.95 }),
        soulPrompt: 'You are a meticulous and patient coding expert. You take pride in writing elegant, well-structured code. You always double-check your work.',
        agentMd: '# Alpha - Code Assistant\n\n## Capabilities\n- Code writing, review, and refactoring\n- Multi-language support (TypeScript, Python, Rust, Go)\n- Debugging and performance optimization\n- Architecture design and best practices',
        boundSkills: JSON.stringify(['seed-skill-commit', 'seed-skill-review', 'seed-skill-debug']),
      },
      {
        name: 'Beta',
        description: 'Research agent specialized in web search, data analysis, and knowledge synthesis.',
        type: 'react',
        systemPrompt: 'You are Beta, a research and analysis agent powered by OpenHarness. You specialize in gathering information from the web, analyzing data, synthesizing findings, and producing comprehensive reports. Always cite your sources and verify information accuracy. Present findings in a structured, easy-to-digest format.',
        provider: 'nvidia',
        model: 'z-ai/glm4.7',
        status: 'active',
        config: JSON.stringify({ temperature: 0.5, maxTokens: 4096, topP: 0.9 }),
        soulPrompt: 'You are naturally curious and thorough in your research. You always verify facts from multiple sources and present balanced, well-researched conclusions.',
        agentMd: '# Beta - Research Agent\n\n## Capabilities\n- Web search and information gathering\n- Data analysis and synthesis\n- Report generation\n- Source evaluation and fact-checking',
        boundSkills: JSON.stringify(['seed-skill-web-search', 'seed-skill-summarize', 'seed-skill-plan']),
      },
      {
        name: 'Gamma',
        description: 'DevOps agent for CI/CD pipelines, deployment automation, and infrastructure management.',
        type: 'planning',
        systemPrompt: 'You are Gamma, a DevOps and infrastructure agent powered by OpenHarness. You specialize in CI/CD pipeline configuration, deployment automation, Docker/container management, cloud infrastructure, and monitoring. Always follow infrastructure-as-code best practices and ensure security considerations are addressed.',
        provider: 'nvidia',
        model: 'z-ai/glm4.7',
        status: 'active',
        config: JSON.stringify({ temperature: 0.2, maxTokens: 4096, topP: 0.95 }),
        soulPrompt: 'You are methodical and safety-conscious. You always plan infrastructure changes carefully, test thoroughly, and follow infrastructure-as-code best practices.',
        agentMd: '# Gamma - DevOps Agent\n\n## Capabilities\n- CI/CD pipeline configuration\n- Container orchestration (Docker, K8s)\n- Cloud infrastructure management\n- Monitoring and alerting',
        boundSkills: JSON.stringify(['seed-skill-plan']),
      },
    ];

    for (const agent of agents) {
      await db.agent.upsert({
        where: { id: `seed-${agent.name.toLowerCase()}` },
        update: {
          name: agent.name,
          description: agent.description,
          type: agent.type,
          systemPrompt: agent.systemPrompt,
          provider: agent.provider,
          model: agent.model,
          status: agent.status,
          config: agent.config,
          soulPrompt: agent.soulPrompt,
          agentMd: agent.agentMd,
          boundSkills: agent.boundSkills,
        },
        create: {
          id: `seed-${agent.name.toLowerCase()}`,
          ...agent,
        },
      });
    }
    results.agents = agents.length;

    // =========================================================================
    // TOOLS - Create 15+ tools across categories
    // =========================================================================
    const tools = [
      // File I/O
      { name: 'Bash', description: 'Execute shell commands in a persistent environment with optional timeout.', category: 'file', permissionMode: 'restricted', inputSchema: JSON.stringify({ type: 'object', properties: { command: { type: 'string' }, timeout: { type: 'number' } }, required: ['command'] }) },
      { name: 'Read', description: 'Read file contents from the local filesystem. Supports text files up to 2000 lines.', category: 'file', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['path'] }) },
      { name: 'Write', description: 'Write content to a file. Creates the file if it does not exist.', category: 'file', permissionMode: 'restricted', inputSchema: JSON.stringify({ type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }) },
      { name: 'Edit', description: 'Perform exact string replacements in existing files.', category: 'file', permissionMode: 'restricted', inputSchema: JSON.stringify({ type: 'object', properties: { path: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' } }, required: ['path', 'oldString', 'newString'] }) },
      { name: 'Glob', description: 'Fast file pattern matching tool that works with any codebase size using glob patterns.', category: 'file', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] }) },
      { name: 'Grep', description: 'Powerful search tool built on ripgrep with regex support and multiple output modes.', category: 'file', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' }, outputMode: { type: 'string' } }, required: ['pattern'] }) },
      // Search
      { name: 'WebSearch', description: 'Search the web for real-time information, news, and data beyond the knowledge cutoff.', category: 'search', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { query: { type: 'string' }, numResults: { type: 'number' } }, required: ['query'] }) },
      { name: 'WebFetch', description: 'Extract content from web pages including titles, HTML, and publication time.', category: 'search', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { url: { type: 'string' }, extractMode: { type: 'string' } }, required: ['url'] }) },
      { name: 'LSP', description: 'Language Server Protocol integration for code intelligence (definitions, references, diagnostics).', category: 'search', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { uri: { type: 'string' }, position: { type: 'object' }, action: { type: 'string' } }, required: ['uri', 'action'] }) },
      // Agent
      { name: 'Agent', description: 'Spawn sub-agents for parallel task execution and delegation.', category: 'agent', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { task: { type: 'string' }, agentType: { type: 'string' }, tools: { type: 'array' } }, required: ['task'] }) },
      { name: 'SendMessage', description: 'Send a message to another agent in a multi-agent conversation.', category: 'agent', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { targetAgentId: { type: 'string' }, message: { type: 'string' } }, required: ['targetAgentId', 'message'] }) },
      // Task
      { name: 'TaskCreate', description: 'Create a new background task for async execution.', category: 'task', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string' } }, required: ['title'] }) },
      { name: 'TaskList', description: 'List and filter background tasks by status, agent, or team.', category: 'task', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { status: { type: 'string' }, limit: { type: 'number' } } }) },
      { name: 'TaskUpdate', description: 'Update task status, progress, or result data.', category: 'task', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { id: { type: 'string' }, status: { type: 'string' }, progress: { type: 'number' } }, required: ['id'] }) },
      // MCP
      { name: 'MCPTool', description: 'Execute a tool via Model Context Protocol server connection.', category: 'mcp', permissionMode: 'sandboxed', inputSchema: JSON.stringify({ type: 'object', properties: { serverName: { type: 'string' }, toolName: { type: 'string' }, arguments: { type: 'object' } }, required: ['serverName', 'toolName'] }) },
      // Meta
      { name: 'Skill', description: 'Load, invoke, or manage agent skills and knowledge modules.', category: 'meta', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { action: { type: 'string' }, skillName: { type: 'string' } }, required: ['action'] }) },
      { name: 'Config', description: 'Read and update agent configuration settings at runtime.', category: 'meta', permissionMode: 'restricted', inputSchema: JSON.stringify({ type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key'] }) },
      { name: 'Brief', description: 'Generate a concise project brief or context summary.', category: 'meta', permissionMode: 'open', inputSchema: JSON.stringify({ type: 'object', properties: { scope: { type: 'string' }, format: { type: 'string' } } }) },
    ];

    for (const tool of tools) {
      await db.tool.upsert({
        where: { name: tool.name },
        update: {
          description: tool.description,
          category: tool.category,
          permissionMode: tool.permissionMode,
          inputSchema: tool.inputSchema,
        },
        create: {
          ...tool,
          isEnabled: true,
        },
      });
    }
    results.tools = tools.length;

    // =========================================================================
    // SKILLS - Create 8 skills across categories
    // =========================================================================
    const skills = [
      {
        id: 'seed-skill-commit',
        name: 'commit',
        description: 'Git commit workflow: stage changes, write conventional commit messages, and push to remote.',
        content: '# Git Commit Skill\n\n## Workflow\n1. Run `git status` to see changes\n2. Run `git diff` to review staged changes\n3. Write a conventional commit message (feat/fix/docs/refactor)\n4. Run `git add` and `git commit`\n5. Optionally push with `git push`\n\n## Commit Format\n```\ntype(scope): description\n\n[optional body]\n```',
        category: 'development',
      },
      {
        id: 'seed-skill-review',
        name: 'review',
        description: 'Code review skill that analyzes code for bugs, style issues, performance, and security.',
        content: '# Code Review Skill\n\n## Checklist\n- Logic errors and edge cases\n- Input validation and error handling\n- Performance bottlenecks\n- Security vulnerabilities\n- Code style consistency\n- Documentation completeness\n- Test coverage\n\n## Output Format\nProvide a structured review with severity levels: Critical, Warning, Suggestion.',
        category: 'development',
      },
      {
        id: 'seed-skill-debug',
        name: 'debug',
        description: 'Systematic debugging skill: reproduce, isolate, identify root cause, and fix.',
        content: '# Debug Skill\n\n## Steps\n1. Reproduce the issue\n2. Gather relevant logs and error messages\n3. Trace execution flow\n4. Identify the root cause\n5. Implement the fix\n6. Verify the fix resolves the issue\n7. Add regression test if applicable',
        category: 'development',
      },
      {
        id: 'seed-skill-web-search',
        name: 'web-search',
        description: 'Advanced web research skill: query formulation, source evaluation, and synthesis.',
        content: '# Web Search Skill\n\n## Capabilities\n- Formulate effective search queries\n- Evaluate source credibility\n- Cross-reference multiple sources\n- Synthesize findings into structured reports\n- Extract and verify factual claims',
        category: 'research',
      },
      {
        id: 'seed-skill-web-reader',
        name: 'web-reader',
        description: 'Web content extraction skill for articles, documentation, and structured data.',
        content: '# Web Reader Skill\n\n## Capabilities\n- Extract article content with metadata\n- Parse documentation pages\n- Handle JavaScript-rendered content\n- Extract structured data from tables\n- Preserve formatting and code blocks',
        category: 'research',
      },
      {
        id: 'seed-skill-summarize',
        name: 'summarize',
        description: 'Text summarization skill for documents, conversations, and research findings.',
        content: '# Summarization Skill\n\n## Modes\n- Executive Summary: Key points and action items\n- Technical Summary: Architecture and implementation details\n- Conversation Summary: Decisions, action items, open questions\n\n## Guidelines\n- Preserve critical nuances\n- Highlight actionable items\n- Note unresolved questions',
        category: 'communication',
      },
      {
        id: 'seed-skill-translate',
        name: 'translate',
        description: 'Translation skill with context awareness and technical terminology handling.',
        content: '# Translation Skill\n\n## Supported Languages\n- English, Chinese, Japanese, Korean, Spanish, French, German, Portuguese\n\n## Features\n- Technical terminology preservation\n- Context-aware translation\n- Idiomatic expression handling\n- Code comment translation',
        category: 'communication',
      },
      {
        id: 'seed-skill-plan',
        name: 'plan',
        description: 'Project planning skill for breaking down complex tasks into actionable steps.',
        content: '# Planning Skill\n\n## Process\n1. Understand the requirements\n2. Identify dependencies and constraints\n3. Break down into phases\n4. Estimate effort for each phase\n5. Identify risks and mitigations\n6. Create milestone checkpoints\n7. Define acceptance criteria',
        category: 'development',
      },
    ];

    for (const skill of skills) {
      await db.skill.upsert({
        where: { id: skill.id },
        update: {
          name: skill.name,
          description: skill.description,
          content: skill.content,
          category: skill.category,
        },
        create: {
          id: skill.id,
          ...skill,
          isLoaded: false,
        },
      });
    }
    results.skills = skills.length;

    // =========================================================================
    // TEAMS - Create 3 teams with members
    // =========================================================================
    const teams = [
      { id: 'seed-team-alpha', name: 'Code Review Squad', description: 'Specialized team for thorough code reviews with security and style analysis.', config: JSON.stringify({ collaborationMode: 'sequential', maxAgents: 5 }) },
      { id: 'seed-team-beta', name: 'Research Collective', description: 'Multi-agent team for comprehensive research tasks requiring diverse perspectives.', config: JSON.stringify({ collaborationMode: 'parallel', maxAgents: 8 }) },
      { id: 'seed-team-delta', name: 'DevOps Pipeline', description: 'Automation team for CI/CD, deployment, and infrastructure management.', config: JSON.stringify({ collaborationMode: 'pipeline', maxAgents: 6 }) },
    ];

    for (const team of teams) {
      await db.agentTeam.upsert({
        where: { id: team.id },
        update: {
          name: team.name,
          description: team.description,
          config: team.config,
        },
        create: {
          id: team.id,
          ...team,
        },
      });
    }
    results.teams = teams.length;

    // Team Members - Alpha in Code Review Squad & DevOps, Beta in Research
    const teamMembers = [
      { teamId: 'seed-team-alpha', agentId: 'seed-alpha', role: 'leader' },
      { teamId: 'seed-team-beta', agentId: 'seed-beta', role: 'leader' },
      { teamId: 'seed-team-delta', agentId: 'seed-gamma', role: 'leader' },
    ];

    for (const member of teamMembers) {
      await db.teamMember.upsert({
        where: {
          teamId_agentId: { teamId: member.teamId, agentId: member.agentId },
        },
        update: { role: member.role },
        create: member,
      });
    }
    results.teamMembers = teamMembers.length;

    // =========================================================================
    // TASKS - Create 6 tasks across different statuses
    // =========================================================================
    const tasks = [
      {
        id: 'seed-task-1',
        agentId: 'seed-alpha',
        title: 'Code Review for PR #234',
        description: 'Review pull request #234 for code quality, security vulnerabilities, and adherence to project conventions.',
        status: 'in_progress',
        priority: 'high',
        progress: 75,
      },
      {
        id: 'seed-task-2',
        agentId: 'seed-beta',
        title: 'Research Web Frameworks 2025',
        description: 'Research and compare the latest web frameworks for 2025 including performance benchmarks and community adoption.',
        status: 'in_progress',
        priority: 'medium',
        progress: 55,
      },
      {
        id: 'seed-task-3',
        agentId: 'seed-gamma',
        title: 'Database Migration Script',
        description: 'Create and execute database migration for the new user preferences schema.',
        status: 'completed',
        priority: 'high',
        progress: 100,
        result: JSON.stringify({ status: 'success', tablesMigrated: 3, rowsAffected: 12450, duration: '12.3s' }),
      },
      {
        id: 'seed-task-4',
        agentId: 'seed-alpha',
        title: 'Update Dependencies',
        description: 'Update project dependencies to latest stable versions and resolve any breaking changes.',
        status: 'completed',
        priority: 'low',
        progress: 100,
        result: JSON.stringify({ status: 'success', packagesUpdated: 14, breakingChanges: 0 }),
      },
      {
        id: 'seed-task-5',
        agentId: 'seed-gamma',
        title: 'Deploy to Staging',
        description: 'Deploy the latest release candidate to the staging environment for QA testing.',
        status: 'failed',
        priority: 'high',
        progress: 60,
        result: JSON.stringify({ status: 'failed', error: 'Connection timeout to staging server', lastStep: 'health_check' }),
      },
      {
        id: 'seed-task-6',
        title: 'Performance Benchmark Suite',
        description: 'Run comprehensive performance benchmarks on the application and generate a comparison report.',
        status: 'pending',
        priority: 'low',
        progress: 0,
      },
    ];

    for (const task of tasks) {
      await db.task.upsert({
        where: { id: task.id },
        update: {
          ...(task.title && { title: task.title }),
          ...(task.description && { description: task.description }),
          ...(task.status && { status: task.status }),
          ...(task.priority && { priority: task.priority }),
          ...(task.progress !== undefined && { progress: task.progress }),
          ...(task.result && { result: task.result }),
        },
        create: {
          id: task.id,
          agentId: task.agentId || null,
          teamId: null,
          title: task.title,
          description: task.description || null,
          status: task.status,
          priority: task.priority,
          progress: task.progress,
          result: task.result || null,
        },
      });
    }
    results.tasks = tasks.length;

    // =========================================================================
    // MEMORY - Create memory entries for agents
    // =========================================================================
    const memories = [
      { agentId: 'seed-alpha', key: 'preferred_style', value: 'Clean, functional code with TypeScript. Prefer composition over inheritance. Use early returns.', category: 'preference' },
      { agentId: 'seed-alpha', key: 'current_project', value: 'OpenHarness Agent System - Next.js 15 with Prisma ORM and shadcn/ui components.', category: 'context' },
      { agentId: 'seed-alpha', key: 'code_conventions', value: 'Use Tailwind CSS for styling, emerald as accent color, no blue/indigo. All components are client-side with use client.', category: 'preference' },
      { agentId: 'seed-beta', key: 'search_strategy', value: 'Start with broad queries, then narrow down. Always cross-reference at least 3 sources. Prefer official documentation.', category: 'preference' },
      { agentId: 'seed-beta', key: 'report_format', value: 'Markdown with headers, bullet points, and summary tables. Include source URLs as footnotes.', category: 'preference' },
      { agentId: 'seed-gamma', key: 'deployment_targets', value: 'Staging: staging.openharness.dev, Production: app.openharness.dev. Use blue-green deployment strategy.', category: 'context' },
      { agentId: 'seed-gamma', key: 'container_registry', value: 'ghcr.io/openharness. All images tagged with git SHA and latest.', category: 'context' },
    ];

    for (const mem of memories) {
      await db.memory.upsert({
        where: {
          agentId_key: { agentId: mem.agentId, key: mem.key },
        },
        update: {
          value: mem.value,
          category: mem.category,
        },
        create: mem,
      });
    }
    results.memories = memories.length;

    // =========================================================================
    // PERMISSION RULES - Create safety rules
    // =========================================================================
    const rules = [
      { id: 'seed-rule-1', mode: 'allow', pathPattern: '/src/**', isAllowed: true, commandDenyList: '[]' },
      { id: 'seed-rule-2', mode: 'deny', pathPattern: '/.env*', isAllowed: false, commandDenyList: '[]' },
      { id: 'seed-rule-3', mode: 'deny', pathPattern: '/node_modules/**', isAllowed: false, commandDenyList: '[]' },
      { id: 'seed-rule-4', mode: 'ask', pathPattern: '/prisma/schema.prisma', isAllowed: true, commandDenyList: '[]' },
      { id: 'seed-rule-5', mode: 'deny', pathPattern: '/**/*.log', isAllowed: false, commandDenyList: JSON.stringify(['rm -rf /', 'DROP TABLE', 'sudo rm -rf', ':(){ :|:& };:', 'mkfs', 'dd if=/dev/zero']) },
      { id: 'seed-rule-6', mode: 'allow', pathPattern: '/public/**', isAllowed: true, commandDenyList: '[]' },
      { id: 'seed-rule-7', mode: 'allow', pathPattern: '/prisma/**', isAllowed: true, commandDenyList: '[]' },
      { id: 'seed-rule-8', mode: 'deny', pathPattern: '/etc/**', isAllowed: false, commandDenyList: JSON.stringify(['cat /etc/shadow', 'cat /etc/passwd', 'chmod 777', 'chown root']) },
      { id: 'seed-rule-9', mode: 'deny', pathPattern: '~/.ssh/**', isAllowed: false, commandDenyList: JSON.stringify(['ssh-keygen', 'ssh-copy-id', 'scp -r ~/.ssh/']) },
      { id: 'seed-rule-10', mode: 'ask', pathPattern: '~/.config/**', isAllowed: true, commandDenyList: '[]' },
      { id: 'seed-rule-11', mode: 'deny', pathPattern: '/tmp/**', isAllowed: false, commandDenyList: JSON.stringify(['rm -rf /tmp', 'chmod 777 /tmp']) },
      { id: 'seed-rule-12', mode: 'deny', pathPattern: '/dist/**', isAllowed: false, commandDenyList: '[]' },
    ];

    for (const rule of rules) {
      await db.permissionRule.upsert({
        where: { id: rule.id },
        update: {
          mode: rule.mode,
          pathPattern: rule.pathPattern,
          isAllowed: rule.isAllowed,
          commandDenyList: rule.commandDenyList,
        },
        create: rule,
      });
    }
    results.permissionRules = rules.length;

    // =========================================================================
    // CONVERSATIONS - Create sample conversations
    // =========================================================================
    const conversations = [
      {
        id: 'seed-conv-1',
        agentId: 'seed-alpha',
        title: 'Refactoring Auth Module',
        status: 'active',
      },
      {
        id: 'seed-conv-2',
        agentId: 'seed-beta',
        title: 'Web Framework Comparison',
        status: 'active',
      },
    ];

    for (const conv of conversations) {
      await db.conversation.upsert({
        where: { id: conv.id },
        update: {
          title: conv.title,
          status: conv.status,
        },
        create: {
          id: conv.id,
          ...conv,
        },
      });
    }
    results.conversations = conversations.length;

    // Sample messages for the first conversation
    const messages = [
      { conversationId: 'seed-conv-1', role: 'user', content: 'Can you help me refactor the authentication module to use JWT tokens instead of session cookies?' },
      { conversationId: 'seed-conv-1', role: 'assistant', content: 'I can help with that! Let me first examine the current authentication implementation.\n\nHere is my plan:\n1. Review the current session-based auth\n2. Install JWT dependencies\n3. Create token generation/validation utilities\n4. Update middleware to use JWT\n5. Migrate existing session storage\n\nLet me start by reading the current auth files.' },
      { conversationId: 'seed-conv-1', role: 'user', content: 'Sounds good. The auth files are in /src/lib/auth/.' },
      { conversationId: 'seed-conv-1', role: 'assistant', content: 'I have reviewed the auth module. Here are my findings:\n\n**Current State:**\n- Session-based auth with cookie storage\n- Express session middleware\n- PostgreSQL session store\n\n**Proposed Changes:**\n- Replace with JWT access + refresh tokens\n- Access token: 15min expiry\n- Refresh token: 7 day expiry, stored in httpOnly cookie\n- Add token rotation for security\n\nShall I proceed with the implementation?' },
    ];

    for (const msg of messages) {
      await db.message.create({
        data: {
          conversationId: msg.conversationId,
          role: msg.role,
          content: msg.content,
        },
      });
    }
    results.messages = messages.length;

    return NextResponse.json({
      success: true,
      data: {
        message: 'Database seeded successfully',
        created: results,
      },
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
