# OpenHarness Agent Architecture Design (v3.0)
> 基于《御舆：解码 Agent Harness — Claude Code 架构深度剖析》的核心设计原则

## 设计哲学（来自 Claude Code 的五大原则）

### 原则一：循环优于递归
对话循环采用 `while(true)` + State对象 + `continue` 管理状态流转。
- **状态恢复更自然**：循环中只需重新赋值state，递归需要回退整个调用栈
- **中止更可控**：AbortController在循环顶部是天然退出点
- **调试更直观**：状态变化在固定位置，一个断点捕获所有转换

### 原则二：Schema 驱动而非硬编码
工具通过统一接口定义，所有验证、权限、描述从同一Schema派生。
- **单一真相源**（Single Source of Truth）
- **Fail-closed 默认值**：新工具默认不安全、需确认，显式声明安全性

### 原则三：渐进式权限
四阶段权限管线，每阶段可短路返回（Fail Fast）。
```
validateInput → checkPermissions → PreToolUse钩子 → 用户确认
```

### 原则四：流式优先
所有数据通过 SSE ReadableStream 的 yield 传递，消费端逐条处理。

### 原则五：可插拔扩展
依赖注入隔离 I/O，核心不知道自己运行在哪里（CLI/Server/SDK）。

---

## 一、六大核心组件

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐                   │
│   │ 对话循环  │────▶│ 权限管线  │────▶│ 工具系统  │                   │
│   │ (Step 1) │◀────│ (Step 3) │     │ (Step 2) │                   │
│   └────┬─────┘     └──────────┘     └────┬─────┘                   │
│        │                                  │                         │
│        │ 上下文过大                        │ 记忆存取                  │
│        ▼                                  ▼                         │
│   ┌──────────┐                        ┌──────────┐                  │
│   │ 上下文   │                        │ 记忆系统  │                  │
│   │ 管理     │                        │ (Step 5) │                  │
│   │ (Step 4) │                        └──────────┘                  │
│   └──────────┘                                                     │
│                                                                     │
│   ┌──────────┐                                                     │
│   │ 钩子系统  │──── PreToolUse ──→ 权限管线                         │
│   │ (Step 6) │──── PostToolUse ──→ 工具系统                         │
│   └──────────┘                                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 二、Step 1: 对话循环（Agent Loop）

### 2.1 核心设计：AsyncGenerator 模式

参考 Claude Code，对话循环是一个异步生成器，通过 `yield` 实时推送 SSE 事件：

```typescript
// 循环状态对象
interface LoopState {
  messages: LLMMessage[];       // 对话消息列表
  turnCount: number;            // 当前轮次
  abortController: AbortController;  // 中止控制
  toolCallsHistory: ToolCallRecord[];  // 工具调用历史
  tokenUsage: TokenUsage;       // Token使用追踪
}

// 事件类型
type StreamEvent =
  | { type: 'thinking'; content: string; model: string }
  | { type: 'token'; content: string; model: string }
  | { type: 'tool_call'; name: string; arguments: string; done: boolean; iteration: number }
  | { type: 'tool_executing'; name: string }
  | { type: 'tool_result'; name: string; result: string; success: boolean; duration: number }
  | { type: 'loop_iteration'; iteration: number; maxIterations: number }
  | { type: 'task_plan'; title: string; steps: string[]; complexity: string }
  | { type: 'done'; usage?: object; model: string; toolCalls?: any[] }
  | { type: 'error'; error: string }
```

### 2.2 循环核心逻辑

```
while (turnCount < maxIterations) {
  turnCount++;
  
  // 1. 检查中止信号
  if (abortController.signal.aborted) break;
  
  // 2. 上下文管理：检查是否需要压缩
  if (estimateTokens(messages) > tokenBudget * 0.9) {
    messages = await compressContext(messages);
    yield { type: 'context_compressed' };
  }
  
  // 3. 流式调用模型
  for await (const event of chatStream(messages, model, tools)) {
    yield event;  // 透传给前端
    // 累积 content / thinking / tool_calls
  }
  
  // 4. 没有工具调用 → 对话结束
  if (toolCalls.length === 0) break;
  
  // 5. 权限检查 → 工具执行
  for (const call of toolCalls) {
    const permission = await checkPermission(call);
    if (!permission.allowed) {
      // 注入拒绝原因，让LLM知道为什么不能执行
      messages.push({ role: 'tool', content: `Permission denied: ${permission.reason}`, tool_call_id: call.id });
      continue;
    }
    const result = await executeTool(call);
    yield { type: 'tool_result', ...result };
    messages.push({ role: 'tool', content: result.data, tool_call_id: call.id });
  }
}
```

### 2.3 与当前实现的对比

| 特性 | 当前实现 | 目标实现 |
|------|---------|---------|
| 循环结构 | while loop + 简单 break | State对象 + 结构化状态转换 |
| 上下文管理 | 无（全量历史传给LLM） | 渐进式压缩（snip→summary） |
| 中止机制 | AbortController存在但未充分使用 | 每轮检查signal，finally清理 |
| 错误恢复 | 工具失败直接记录，不重试 | 断路器（连续3次失败降级） |
| Token追踪 | 仅在done事件记录 | 每轮检查预算，超限自动压缩 |

---

## 三、Step 2: 工具系统（buildTool 工厂模式）

### 3.1 buildTool 工厂函数

参考 Claude Code 的 `buildTool` 模式，工具定义保持精简，通用行为由工厂提供：

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  
  // 执行器
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
  
  // 安全标记（Fail-closed 默认值）
  isReadOnly?: boolean;          // 默认 false
  isDestructive?: boolean;       // 默认 false
  isConcurrencySafe?: boolean;   // 默认 false
  
  // 权限
  permissionMode?: 'open' | 'restricted' | 'sandboxed';
  validateInput?: (input: unknown) => { valid: boolean; message?: string };
}

const TOOL_DEFAULTS = {
  isReadOnly: false,
  isDestructive: false,
  isConcurrencySafe: false,
  permissionMode: 'restricted' as const,
};

type ToolDef = Partial<Pick<ToolDefinition, 'isReadOnly' | 'isDestructive' | 'isConcurrencySafe'>>
  & Omit<ToolDefinition, 'isReadOnly' | 'isDestructive' | 'isConcurrencySafe'>;

function buildTool(def: ToolDef): ToolDefinition {
  return { ...TOOL_DEFAULTS, ...def };
}
```

### 3.2 工具描述优化（从API文档风格→使用指导风格）

**当前问题**：工具描述是技术API风格，LLM难以判断"何时该用"。

**改进**：每个工具描述包含三部分：
1. **一句话描述**（<80字，面向LLM）
2. **何时使用**（3-5个场景触发条件）
3. **使用示例**（2-3个JSON示例）

```typescript
// 当前（技术风格）
{
  name: 'WebSearch',
  description: 'Search the web for real-time information. Returns a list of search results with titles, URLs, and snippets.'
}

// 改进后（使用指导风格）
{
  name: 'WebSearch',
  description: 'Search the web for real-time information.',
  whenToUse: [
    '需要最新信息或实时数据（新闻、价格、天气）',
    '用户明确要求搜索或查找',
    '回答需要引用来源或URL',
    '需要验证某个事实是否仍然准确',
  ],
  whenNotToUse: [
    '基于已有对话上下文就能回答的问题',
    '纯数学/逻辑推理',
    '创意写作或头脑风暴',
  ],
  examples: [
    { query: 'Next.js 15 new features 2025' },
    { query: 'TypeScript 5.8 release notes', recency_days: 30 },
  ],
}
```

### 3.3 工具结果智能处理

```typescript
const MAX_TOOL_RESULT_LENGTH = 3000;  // 单个工具结果最大字符数

async function processToolResult(result: string): Promise<string> {
  if (result.length <= MAX_TOOL_RESULT_LENGTH) return result;
  
  // 超长结果 → 生成摘要（而非简单截断）
  const summary = await summarizeText(result, {
    maxLength: MAX_TOOL_RESULT_LENGTH,
    preserveStructure: true,  // 保留列表、标题等结构
  });
  return summary + `\n\n[Original result was ${result.length} chars, summarized]`;
}
```

---

## 四、Step 3: 权限管线（四阶段短路检查）

### 4.1 四阶段管线

```
┌──────────────────────────────────────────────────────────────┐
│  工具调用请求                                                 │
│       │                                                      │
│       ▼                                                      │
│  ┌─────────────────────┐                                     │
│  │ 阶段1: validateInput  │ ──失败──→ 拒绝: "参数不合法: ..."    │
│  │ 输入校验（Schema验证） │                                     │
│  └──────────┬──────────┘                                     │
│             │ 通过                                             │
│             ▼                                                 │
│  ┌─────────────────────┐                                     │
│  │ 阶段2: checkPermissions│ ──拒绝──→ 拒绝: "权限不足: ..."     │
│  │ 权限模式检查         │                                     │
│  └──────────┬──────────┘                                     │
│             │ 通过                                             │
│             ▼                                                 │
│  ┌─────────────────────┐                                     │
│  │ 阶段3: runHooks       │ ──block──→ 拒绝: "钩子拦截: ..."     │
│  │ PreToolUse 钩子执行   │                                     │
│  └──────────┬──────────┘                                     │
│             │ 通过/无钩子                                        │
│             ▼                                                 │
│  ┌─────────────────────┐                                     │
│  │ 阶段4: canUseTool     │                                     │
│  │ 根据权限模式决定       │                                     │
│  │ open → 自动通过        │                                     │
│  │ restricted → 自动通过  │                                     │
│  │ sandboxed → 仅只读通过 │                                     │
│  └──────────┬──────────┘                                     │
│             │                                                 │
│             ▼                                                 │
│       执行工具 ✅                                               │
└──────────────────────────────────────────────────────────────┘
```

**关键设计**：早期拒绝（Fail Fast）。输入不合法就不检查权限，权限拒绝就不执行钩子。

---

## 五、Step 4: 上下文管理（渐进式压缩）

### 5.1 四级渐进压缩策略

参考 Claude Code 的四级压缩（Snip → Microcompact → Context Collapse → Autocompact）：

```typescript
interface CompressionStrategy {
  name: string;
  trigger: (tokenCount: number, limit: number) => boolean;
  compress: (messages: LLMMessage[]) => Promise<LLMMessage[]>;
}

// 策略1: Snip（最廉价，70%阈值触发）
const snipStrategy: CompressionStrategy = {
  name: 'snip',
  trigger: (count, limit) => count > limit * 0.7,
  async compress(messages) {
    // 保留: system prompt + 最近15条消息 + 首条用户消息
    const system = messages.filter(m => m.role === 'system');
    const recent = messages.slice(-15);
    const firstUser = messages.find(m => m.role === 'user');
    return [...system, firstUser, ...recent];
  },
};

// 策略2: Summary（中等成本，90%阈值触发）
const summaryStrategy: CompressionStrategy = {
  name: 'summary',
  trigger: (count, limit) => count > limit * 0.9,
  async compress(messages) {
    // 使用LLM生成对话摘要
    const oldMessages = messages.slice(1, -10);
    const summary = await generateSummary(oldMessages);
    return [
      messages[0],  // system prompt
      { role: 'user', content: `[Previous conversation summary]\n${summary}` },
      ...messages.slice(-10),  // 最近10条保留原文
    ];
  },
};
```

### 5.2 Token预算管理

```typescript
class TokenBudget {
  private readonly maxInputTokens: number;  // 模型上下文窗口
  private readonly systemPromptTokens: number;  // 系统提示占用
  private readonly reservedTokens: number = 1000;  // 预留给回复
  
  get availableForMessages(): number {
    return this.maxInputTokens - this.systemPromptTokens - this.reservedTokens;
  }
  
  shouldCompress(currentTokens: number): boolean {
    return currentTokens > this.availableForMessages * 0.75;
  }
}
```

---

## 六、Step 5: 记忆系统

### 6.1 三层记忆架构

```
┌──────────────────────────────────────────────┐
│  Layer 1: 对话内记忆（自动）                    │
│  - System Prompt 中的 Agent Identity           │
│  - 对话历史（最近N轮，超出自动压缩）             │
│  - 工具调用结果（当前会话内）                    │
├──────────────────────────────────────────────┤
│  Layer 2: 会话间记忆（DB持久化）                 │
│  - Memory 表（key-value 键值对）                │
│  - 用户偏好（"我喜欢用Jest"）                   │
│  - 项目约定（"使用camelCase命名"）              │
│  - 重要决策（"选择Redis作为缓存"）               │
├──────────────────────────────────────────────┤
│  Layer 3: 知识库（Skill系统）                    │
│  - 专业知识模块（代码审查、调试方法论等）          │
│  - 按需加载，不占用默认上下文                    │
└──────────────────────────────────────────────┘
```

### 6.2 记忆注入策略

```typescript
function buildMemorySection(agentId: string): string {
  // 从DB加载该Agent的记忆
  const memories = await db.memory.findMany({
    where: { agentId },
    orderBy: { updatedAt: 'desc' },
    take: 10,  // 最多注入10条记忆
  });
  
  if (memories.length === 0) return '';
  
  return `
## Memory (Your Persistent Knowledge)
The following facts have been learned from previous conversations. Use them when relevant:
${memories.map(m => `- **${m.key}**: ${m.value}`).join('\n')}
`;
}
```

---

## 七、Step 6: Plan模式（规划与执行分离）

### 7.1 核心理念：先规划后执行

参考 Claude Code 的 EnterPlanMode/ExitPlanMode 设计：

```
用户请求 ──→ 判断任务复杂度
                │
        ┌───────┴───────┐
        │               │
    简单任务          复杂任务
        │               │
   直接执行        ┌────┴────┐
                   │ Plan模式 │
                   │（只读探索）│
                   └────┬────┘
                        │
                   1. 理解需求
                   2. 分析上下文
                   3. 制定方案
                   4. 呈现计划
                        │
                   用户确认？
                   是 → 执行
                   否 → 修改计划
```

### 7.2 Plan模式的System Prompt

```typescript
const planModePrompt = `
## Plan Mode — Read-Only Exploration

You are now in PLANNING MODE. In this mode, you should NOT execute any actions.
Instead, thoroughly analyze the request and create a structured plan.

### Planning Steps:
1. **Understand**: What is the user REALLY asking for? Identify implicit requirements.
2. **Analyze**: What information do you need? What tools would be useful?
3. **Explore**: If needed, use WebSearch to gather information (read-only).
4. **Plan**: Create a clear, step-by-step execution plan.
5. **Present**: Show the plan using TaskPlan tool with clear steps.

### Important:
- Do NOT use destructive tools (Write, Edit, Bash) in plan mode
- Focus on understanding the full picture before acting
- Consider edge cases and potential issues
- Present alternatives if multiple approaches exist
`;
```

---

## 八、多Agent协同（Coordinator-Worker 架构）

### 8.1 Coordinator模式（参考 Claude Code）

```
┌─────────────────────────────────────────────────────────────┐
│  Coordinator（协调者）                                         │
│                                                               │
│  只拥有4个工具：                                                │
│  ┌─────────────────────────────────────────────┐              │
│  │ 1. Agent    — 创建Worker并分配任务              │              │
│  │ 2. TaskStop — 停止正在运行的Worker            │              │
│  │ 3. Message  — 向Worker发送消息（协作）          │              │
│  │ 4. Output   — 输出结构化最终结果                │              │
│  └─────────────────────────────────────────────┘              │
│                                                               │
│  没有文件/搜索等执行工具 → 不会自己动手做事                        │
│  → 职责是"编排"而非"执行"                                        │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Worker A  │ │ Worker B  │ │ Worker C  │
  │ (Research)│ │ (Analysis)│ │ (Writing) │
  │           │ │           │ │           │
  │ 有完整工具集│ │ 有完整工具集│ │ 有完整工具集│
  │ 专业system │ │ 专业system │ │ 专业system │
  │   prompt   │ │   prompt   │ │   prompt   │
  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
        │             │             │
        └─────────────┼─────────────┘
                      ▼
              Scratchpad（共享协作空间）
```

### 8.2 Worker的专业化Prompt

```typescript
function buildWorkerPrompt(
  agent: AgentConfig,
  task: string,
  scratchpadContext: string,
): string {
  return `
# Role: ${agent.name}
${agent.agentMd}

## Your Current Task
${task}

## Context from Coordinator
${scratchpadContext}

## Collaboration Rules
- Focus ONLY on your assigned task
- Write findings to the scratchpad using TaskUpdate
- If blocked, describe what you need — don't guess
- Be thorough but concise
- Use WebSearch/WebFetch when you need external information
`;
}
```

### 8.3 与当前实现的对比

| 特性 | 当前实现 | 目标实现 |
|------|---------|---------|
| 协作模式 | 顺序A→B→C→拼接 | Coordinator-Worker并行 |
| Agent间通信 | 仅前输出作后输入 | Scratchpad共享空间+SendMessage |
| Coordinator角色 | LLM生成一句话计划 | 专职协调者，只有4个工具 |
| Worker工具 | 与主Agent相同 | 按任务类型过滤（Worker只看到需要的工具） |
| 结果综合 | LLM简单拼接 | Coordinator整合，解决矛盾和去重 |

---

## 九、自主Agent模式

### 9.1 Plan → Execute → Observe → Reflect 循环

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  用户目标                                                        │
│     │                                                            │
│     ▼                                                            │
│  ┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐ │
│  │  PLAN   │────▶│ EXECUTE  │────▶│ OBSERVE  │────▶│ REFLECT  │ │
│  │         │     │          │     │          │     │          │ │
│  │ TaskPlan│     │ 工具调用   │     │ 收集结果   │     │ 目标达成?│ │
│  │ 展示计划 │     │ 生成内容   │     │ 验证质量   │     │ 需要修正?│ │
│  └─────────┘     └──────────┘     └──────────┘     └────┬─────┘ │
│       │                                                │        │
│       │                                        ┌────────┤        │
│       │                                        │ Yes    │ No     │
│       │                                        ▼        ▼        │
│       │                                   ┌────────┐ ┌────────┐ │
│       │                                   │ REPORT │ │ REPLAN │ │
│       │                                   │ 最终   │ │ 调整   │ │
│       │                                   │ 报告   │ │ 计划   │ │
│       │                                   └────────┘ └───┬────┘ │
│       │                                              │       │
│       └──────────────────────────────────────────────┘       │
│                                                              │
│  终止条件: 目标达成 / maxIterations / timeBudget / 用户中断      │
└──────────────────────────────────────────────────────────────────┘
```

### 9.2 自主模式 vs 普通模式

| | 普通模式 | 自主模式 |
|---|---|---|
| 触发方式 | 用户发送消息 | 用户发送消息 + autonomous=true |
| 计划 | 可选（复杂任务自动） | 必须（第一步就是TaskPlan） |
| 循环上限 | 5次 | 20次（可配置） |
| 时间预算 | 90s（单次API调用） | 300s（整个任务） |
| Reflection | 无 | 每轮都有（内嵌在prompt中） |
| 进度追踪 | 无 | TaskPlan实时更新到UI |
| 中间汇报 | 无 | 每完成大步骤向用户报告 |

---

## 十、实施路线图（六步渐进式）

### Phase 1: 对话循环 + 工具系统 ✅ COMPLETED
- [x] 重构 `stream/route.ts`：State对象模式 → `src/lib/agent/agent-loop.ts` (AsyncGenerator + LoopState)
- [x] 实现 `buildTool` 工厂函数 → `src/lib/agent/tools.ts` (buildTool factory + TOOL_REGISTRY)
- [x] 优化工具描述（使用指导风格）→ whenToUse/whenNotToUse + examples on all tools
- [x] 工具结果智能截断/摘要 → processToolResult() with head+tail truncation
- [x] 错误恢复 + 断路器（连续3次失败）→ Circuit breaker in agent-loop.ts
- [x] Token预算检查 → TokenUsage tracking in LoopState
- [x] 核心类型定义 → `src/lib/agent/types.ts` (LoopState, StreamEvent, AgentTool, etc.)
- [x] 思考过程显示修复 → 已验证ThinkingBlock自动展开/折叠逻辑正确
- [x] 协作路由导入更新 → collaborative/route.ts 使用新的 @/lib/agent/tools 路径

### Phase 2: 权限管线 + 上下文管理（Week 3）
- [ ] 四阶段权限检查
- [ ] Snip压缩策略（70%阈值）
- [ ] Summary压缩策略（90%阈值）
- [ ] Token计数器

### Phase 3: 记忆系统 + Skill系统（Week 4）
- [ ] 记忆注入到System Prompt
- [ ] Skill轻量化（只放索引）
- [ ] 按需加载Skill

### Phase 4: Plan模式（Week 5）
- [ ] Plan模式System Prompt
- [ ] TaskPlan工具增强
- [ ] 用户确认机制

### Phase 5: 多Agent协同升级（Week 6-7）
- [ ] Coordinator-Worker架构
- [ ] Scratchpad共享空间
- [ ] 并行Worker执行
- [ ] Worker专业化Prompt

### Phase 6: 自主Agent（Week 8）
- [ ] 自主循环（Plan→Execute→Observe→Reflect）
- [ ] 进度追踪UI
- [ ] 时间预算
- [ ] 中间汇报

---

## 十一、关键设计决策总结

| 决策点 | 选择 | 原因（来自Claude Code） |
|--------|------|----------------------|
| 循环 vs 递归 | 循环（State对象） | 状态恢复自然、中止可控、调试直观 |
| 工具默认安全性 | Fail-closed | 新工具默认不安全，显式声明才安全 |
| 权限检查 | 四阶段管线 | 早期拒绝（Fail Fast），避免浪费 |
| 上下文压缩 | 渐进式 | 信息损失相对，保留最有价值的部分 |
| 协作模式 | Coordinator-Worker | 协调者只编排不执行，避免混乱 |
| Plan模式 | 先规划后执行 | 避免"过早行动"，零成本纠错 |
| 错误处理 | 断路器 + 降级 | 连续失败3次快速放弃，而非无限重试 |
| 流式传输 | SSE yield | 天然适配"生产-消费"模型 |
| I/O隔离 | 依赖注入 | 核心不知道运行在哪里 |
