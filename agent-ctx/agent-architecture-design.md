# OpenHarness Agent Architecture Design (v2.0)

## 一、总体架构概览

OpenHarness Agent 系统采用**五层递进架构**，从简单到复杂逐步构建智能能力：

```
┌─────────────────────────────────────────────────────────────┐
│                   Level 5: 自主Agent                          │
│   自我规划 → 自我执行 → 自我反思 → 自我修正 → 循环迭代          │
├─────────────────────────────────────────────────────────────┤
│                   Level 4: 多Agent协同                        │
│   任务分解 → 角色分配 → 并行/串行执行 → 结果融合 → 质量评审     │
├─────────────────────────────────────────────────────────────┤
│                   Level 3: Skill系统                          │
│   智能检索 → 上下文注入 → 动态加载 → 效果评估 → 自适应          │
├─────────────────────────────────────────────────────────────┤
│                   Level 2: 工具调用                           │
│   ReAct循环 → 工具编排 → 参数优化 → 结果验证 → 错误恢复         │
├─────────────────────────────────────────────────────────────┤
│                   Level 1: 单Agent交互                        │
│   意图理解 → 推理链 → 结构化输出 → 对话管理                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、Level 1: 单Agent交互

### 2.1 当前问题
- System Prompt 过于简单，缺少深度的角色定义和行为约束
- 没有意图分类机制，所有请求都走同一条路径
- 缺少对话质量保障（输出格式不统一、回答质量不稳定）
- 思考过程未充分利用（thinking仅在部分模型支持）

### 2.2 改进方案

#### 2.2.1 增强型System Prompt架构

```
SystemPrompt = {
  // 1. 身份层：我是谁
  identity: AgentIdentity,
  
  // 2. 能力层：我能做什么
  capabilities: AgentCapabilities,
  
  // 3. 行为层：我该怎么行动
  behaviors: AgentBehaviors,
  
  // 4. 上下文层：当前环境信息
  context: DynamicContext,
  
  // 5. 约束层：我不该做什么
  constraints: SafetyConstraints,
  
  // 6. 输出层：我该怎么表达
  outputFormat: OutputGuidelines,
}
```

#### 2.2.2 意图分类器（前置路由）

在调用主LLM之前，先通过一个轻量级的意图分类确定处理路径：

```typescript
type UserIntent = 
  | 'simple_qa'      // 简单问答 → 直接回答
  | 'research'       // 研究调查 → 需要搜索
  | 'code_help'      // 代码帮助 → 需要分析
  | 'task_execute'   // 任务执行 → 需要工具
  | 'creative'       // 创意生成 → 需要推理
  | 'clarification'  // 澄清请求 → 需要追问
```

分类方式：不需要单独的模型调用，而是在system prompt中指导LLM自主判断，并在第一轮response中通过隐藏的thinking体现。

#### 2.2.3 结构化思考链（Chain-of-Thought增强）

```typescript
interface ThinkingStructure {
  // 第一层：理解
  understanding: {
    userGoal: string;           // 用户真正想要什么
    complexity: 'simple' | 'moderate' | 'complex';
    keyRequirements: string[];
  };
  
  // 第二层：规划
  plan: {
    approach: string;           // 解决方案概述
    steps: string[];            // 具体步骤
    toolsNeeded: string[];      // 需要的工具
    estimatedIterations: number;
  };
  
  // 第三层：执行跟踪
  execution: {
    currentStep: number;
    findings: string[];         // 每步的发现
    adjustments: string[];      // 根据发现做的调整
  };
  
  // 第四层：验证
  verification: {
    completeness: boolean;
    accuracy: string;
    missingInfo: string[];
  };
}
```

### 2.3 实现要点

- **Prompt模板系统**：将Agent的systemPrompt拆分为多个可组合的模板section
- **动态上下文注入**：根据对话历史和用户意图，动态调整prompt的各部分权重
- **思考过程引导**：通过system prompt中的methodology section引导模型进行结构化思考
- **对话标题自动生成**：使用LLM在第一次对话后自动生成精简标题

---

## 三、Level 2: 工具调用

### 3.1 当前问题
- 工具定义是静态的，所有工具一次性全部传给LLM
- 工具描述过于技术化，LLM难以准确选择合适的工具
- 没有工具使用策略，LLM可能重复调用或遗漏关键工具
- 错误恢复机制薄弱，工具失败后没有重试或替代方案
- 工具编排能力弱，只能串行执行，不能并行

### 3.2 改进方案

#### 3.2.1 工具智能选择（Tool Router）

**核心思想**：不让LLM一次性看到所有工具，而是先通过"工具目录"让它选择需要的工具类别，再提供具体工具定义。

```
Step 1: 提供工具目录（轻量级）
┌────────────────────────────────────────┐
│ Available Tool Categories:             │
│ 1. 🔍 Search (WebSearch, WebFetch)    │
│ 2. 📋 Task Management (Create, List,  │
│    Update, Plan)                       │
│ 3. 🤖 Agent Operations (Info, Message) │
│ 4. 📚 Knowledge (Skill, Config)       │
│ 5. 🧠 Planning (TaskPlan)             │
│                                        │
│ Which categories are relevant to the   │
│ user's request?                        │
└────────────────────────────────────────┘

Step 2: 根据选择提供具体工具定义
→ 仅注入用户选定类别的工具schema
```

**实现**：两阶段ReAct循环
1. 第一轮：只提供ToolRouter工具（选择类别），不提供具体工具
2. 第二轮及以后：根据第一轮选择注入具体工具

#### 3.2.2 工具使用策略（Tool Usage Strategy）

```typescript
interface ToolStrategy {
  // 工具选择指导
  selection: {
    // 什么时候用搜索
    searchWhen: [
      '需要最新信息',
      '用户明确要求搜索',
      '回答需要引用来源',
      '涉及实时数据（价格、天气、新闻）',
    ],
    // 什么时候用任务管理
    taskWhen: [
      '请求包含多个步骤',
      '需要追踪进度',
      '用户提到"任务"、"计划"、"清单"',
      '涉及需要后续跟进的事项',
    ],
    // 什么时候不需要工具
    noToolWhen: [
      '简单问答',
      '代码解释/编写（模型自身能力足够）',
      '基于已有上下文的推理',
      '创意性任务（如写作建议）',
    ],
  };
  
  // 工具组合模式
  composition: {
    searchThenAnalyze: 'WebSearch → 分析结果 → TaskPlan（如果复杂）',
    planThenExecute: 'TaskPlan → 逐步执行 → TaskUpdate',
    researchReport: 'WebSearch(多次) → 整合 → WebFetch(关键页面)',
  };
  
  // 错误恢复
  errorRecovery: {
    retry: '工具失败时，先重试一次（换参数）',
    alternative: '如果工具不可用，尝试替代工具或方案',
    gracefulDegradation: '无法使用工具时，基于已有知识回答并说明限制',
  };
}
```

#### 3.2.3 增强型ReAct循环

```
┌─────────────────────────────────────────────────────────────────┐
│                    Enhanced ReAct Loop                           │
│                                                                  │
│  ┌──────┐    ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │ User │───▶│  Think   │───▶│   Act    │───▶│  Observe    │  │
│  │Query │    │          │    │          │    │              │  │
│  └──────┘    │ • 分析意图 │    │ • 选工具   │    │ • 解析结果    │  │
│      ▲      │ • 制定计划 │    │ • 构参数   │    │ • 验证有效性  │  │
│      │      │ • 预判结果 │    │ • 调用执行  │    │ • 更新知识    │  │
│      │      └──────────┘    └──────────┘    └──────┬───────┘  │
│      │                                               │          │
│      │         ┌──────────┐                          │          │
│      │         │ Reflect  │◀─────────────────────────┘          │
│      │         │          │                                     │
│      │         │ • 结果足够？                                     │
│      │         │ • 需要更多信息？                                   │
│      │         │ • 需要修正？                                     │
│      │         │ • 工具调用失败？                                   │
│      │         └────┬─────┘                                     │
│      │              │                                            │
│      │         ┌────┴────┐                                      │
│      │         │         │                                       │
│      │    ┌────▼───┐ ┌───▼────┐                                  │
│      │    │  Done  │ │ Loop   │──→ Think                       │
│      │    └────┬───┘ └────────┘                                  │
│      │         │                                                 │
│      └─────────┘                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**关键改进**：
- **Reflection步骤**：每次工具调用后，模型需要判断是否需要继续、修正或终止
- **上下文累积**：工具结果会累积，模型能"记住"之前的发现
- **动态工具注入**：根据Reflection结果，可能需要新的工具
- **最大迭代次数智能调整**：根据任务复杂度动态调整（简单任务1-2次，复杂任务5-8次）

### 3.3 实现要点

- **工具描述优化**：将工具描述从技术API文档风格改为"何时使用"风格
- **参数示例**：每个工具定义中添加2-3个使用示例
- **工具结果截断**：过长的工具结果自动摘要，避免token浪费
- **工具调用日志**：每次工具调用记录到DB，用于后续分析和优化

---

## 四、Level 3: Skill系统

### 4.1 当前问题
- Skills作为静态文本全部注入system prompt，占用大量token
- 没有智能的skill检索机制，无法根据用户请求动态选择相关skill
- Skill内容可能很长，简单注入会稀释核心prompt的效果
- 没有skill使用效果反馈，无法知道skill是否真的帮助了回答

### 4.2 改进方案

#### 4.2.1 两级Skill系统

```
Level 1: Agent Bound Skills（绑定技能）
  ├── 在system prompt中简要提及（仅名称+一句话描述）
  ├── 不注入完整内容
  └── 当LLM决定需要时，通过Skill工具加载完整内容

Level 2: Dynamic Skills（动态技能）
  ├── 根据用户意图智能推荐
  ├── 通过Tool调用按需加载
  └── 加载结果注入到对话上下文（而非system prompt）
```

#### 4.2.2 Skill智能匹配

```typescript
// Skill注册信息（DB中的轻量级索引）
interface SkillIndex {
  id: string;
  name: string;
  shortDescription: string;    // 一句话描述（<50字）
  triggers: string[];           // 触发关键词
  category: string;
}

// System Prompt中的Skill引导
const skillGuidance = `
## Available Knowledge Modules
You have access to specialized knowledge modules (Skills). When relevant:
1. Use the Skill tool with action "list" to see available skills
2. Use the Skill tool with action "load" and skillId to load a skill
3. Only load skills that are directly relevant to the user's request

Quick reference:
- **commit**: Git commit conventions and best practices
- **review**: Code review methodology and checklists  
- **debug**: Systematic debugging approach
- **web-search**: How to effectively search the web
- **summarize**: Information summarization techniques
- **plan**: Task planning and decomposition methods
`;
```

#### 4.2.3 Skill使用效果追踪

```typescript
interface SkillUsage {
  skillId: string;
  conversationId: string;
  messageId: string;
  loadedAt: Date;
  wasHelpful: boolean;        // 简化：如果该消息的工具调用中加载了skill且最终回答质量高
  userRating?: number;         // 未来可以加用户评分
}
```

### 4.3 实现要点

- **Skill轻量化注入**：System prompt中只放skill索引，不放完整内容
- **按需加载**：通过Skill工具在对话过程中动态加载
- **Skill摘要**：对于超长的skill内容，自动生成摘要版用于注入
- **Skill过期机制**：对话超过一定轮次后，早期加载的skill内容可以丢弃以节省token

---

## 五、Level 4: 多Agent协同

### 5.1 当前问题
- 协作是简单的顺序执行（A做完→B做→C做→汇总）
- Agent之间没有真正的沟通，只是把前一个agent的输出当作下一个的输入
- Coordinator（协调者）的计划过于简单，只是一句话分配
- Synthesis（综合）只是简单拼接，没有解决矛盾和去重
- 没有角色专业化（所有agent用同一个system prompt模板）

### 5.2 改进方案

#### 5.2.1 真正的协作架构

```
┌──────────────────────────────────────────────────────────────┐
│                    Multi-Agent Orchestrator                    │
│                    (协调引擎 - 不依赖LLM)                       │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                   Phase 1: Analysis                     │  │
│  │  LLM分析用户请求 → 生成任务分解图(Task Decomposition)     │  │
│  │  → 识别子任务间的依赖关系                                 │  │
│  │  → 确定哪些任务可以并行                                   │  │
│  └─────────────────────┬──────────────────────────────────┘  │
│                        │                                       │
│  ┌─────────────────────▼──────────────────────────────────┐  │
│  │                 Phase 2: Assignment                      │  │
│  │  根据Agent能力矩阵分配任务 → 生成执行计划                  │  │
│  │  → 考虑Agent的专业领域和可用工具                           │  │
│  │  → 为每个Agent生成专门的系统提示                            │  │
│  └─────────────────────┬──────────────────────────────────┘  │
│                        │                                       │
│  ┌─────────────────────▼──────────────────────────────────┐  │
│  │              Phase 3: Parallel Execution                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │  │
│  │  │ Agent A  │  │ Agent B  │  │ Agent C  │             │  │
│  │  │(Search)  │  │(Analyze) │  │(Create)  │             │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘             │  │
│  │       │              │              │                    │  │
│  │       └──────────────┴──────────────┘                    │  │
│  │                      │                                   │  │
│  │  ┌───────────────────▼────────────────────────┐         │  │
│  │  │       Phase 4: Review & Quality Gate       │         │  │
│  │  │  自审Agent检查所有输出 → 发现问题 → 反馈修正  │         │  │
│  │  └───────────────────┬────────────────────────┘         │  │
│  │                      │                                   │  │
│  │  ┌───────────────────▼────────────────────────┐         │  │
│  │  │       Phase 5: Synthesis & Delivery         │         │  │
│  │  │  合成Agent整合所有输出 → 去重 → 格式化 → 交付  │         │  │
│  │  └─────────────────────────────────────────────┘         │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

#### 5.2.2 任务分解图（Task Decomposition Graph）

```typescript
interface TaskDecomposition {
  goal: string;                    // 用户原始目标
  subtasks: Subtask[];
  dependencies: Dependency[];      // 子任务间的依赖关系
  parallelGroups: string[][];      // 可以并行执行的分组
}

interface Subtask {
  id: string;
  description: string;
  assignedAgent: string;           // 分配给的agent
  requiredTools: string[];         // 需要的工具
  requiredSkills: string[];       // 需要的skill
  estimatedComplexity: 'low' | 'medium' | 'high';
  dependsOn: string[];            // 依赖的subtask IDs
  outputFormat: string;           // 期望输出格式
}

interface Dependency {
  from: string;                   // subtask ID
  to: string;                     // subtask ID
  type: 'sequential' | 'shared_output' | 'review';
}
```

#### 5.2.3 Agent专业化（Specialized Prompts）

每个Agent不再使用通用的system prompt，而是根据其角色和分配的任务生成专门的prompt：

```typescript
function buildSpecializedPrompt(
  baseAgent: AgentConfig,
  task: Subtask,
  globalContext: string,
  previousResults: Map<string, string>
): string {
  return `
# Role: ${baseAgent.name} — ${task.description}

## Your Specific Mission
${task.description}

## Expected Output
${task.outputFormat}

## Available Tools
${getRelevantToolDescriptions(task.requiredTools)}

## Context from Other Agents
${formatPreviousResults(previousResults, task.dependsOn)}

## Collaboration Guidelines
- Focus ONLY on your assigned task
- If you discover information relevant to other agents' tasks, note it in a "Notes for Team" section
- If your task cannot be completed (missing info, blocked), clearly state what's needed
- Be thorough but concise — other agents will build on your work
`;
}
```

#### 5.2.4 并行执行引擎

```typescript
async function executeParallel(
  tasks: Subtask[],
  agents: Map<string, AgentConfig>,
  context: SharedContext
): Promise<Map<string, AgentResult>> {
  // 1. 构建DAG（有向无环图）
  const dag = buildDAG(tasks);
  
  // 2. 拓扑排序，确定执行层级
  const layers = topologicalSort(dag);
  
  // 3. 逐层执行，同层内并行
  const results = new Map<string, AgentResult>();
  
  for (const layer of layers) {
    // 并行执行同层任务
    const layerPromises = layer.map(taskId => {
      const task = tasks.find(t => t.id === taskId)!;
      const agent = agents.get(task.assignedAgent)!;
      
      return executeSingleAgent(agent, task, results, context);
    });
    
    const layerResults = await Promise.all(layerPromises);
    layerResults.forEach((result, i) => {
      results.set(layer[i], result);
    });
    
    // 质量门控：检查本层结果是否可接受
    await qualityGate(layer, results, context);
  }
  
  return results;
}
```

#### 5.2.5 质量门控（Quality Gate）

```typescript
async function qualityGate(
  taskIds: string[],
  results: Map<string, AgentResult>,
  context: SharedContext
): Promise<{ passed: boolean; feedback?: string }> {
  // 使用LLM快速评估每个结果
  for (const taskId of taskIds) {
    const result = results.get(taskId)!;
    const task = context.tasks.find(t => t.id === taskId)!;
    
    const evaluation = await evaluateResult(task, result);
    
    if (!evaluation.passed) {
      // 返回反馈给agent重新执行
      if (evaluation.retryCount < 2) {
        const retryResult = await retryWithFeedback(
          task, evaluation.feedback
        );
        results.set(taskId, retryResult);
      }
      // 否则接受当前结果并继续
    }
  }
  
  return { passed: true };
}
```

### 5.3 实现要点

- **依赖分析**：Coordinator需要识别子任务间的依赖关系
- **并行执行**：使用Promise.all并行执行无依赖关系的任务
- **共享上下文**：所有agent共享一个context对象，agent可以向其中写入发现
- **流式输出**：每个agent的输出都实时流式推送给用户
- **时间预算**：设置总时间上限，避免某个agent耗时过长

---

## 六、Level 5: 自主Agent

### 6.1 概念

自主Agent是最高级别的Agent能力，具有以下特征：
- **自我规划**：不需要用户逐步指导，能自主制定执行计划
- **自我执行**：按照计划自主调用工具、执行操作
- **自我反思**：在执行过程中持续评估自己的工作质量
- **自我修正**：发现问题后能自主调整策略
- **持续迭代**：直到任务完成或达到预设条件才停止

### 6.2 自主Agent循环

```
┌─────────────────────────────────────────────────────────────────┐
│                     Autonomous Agent Loop                         │
│                                                                  │
│  ┌─────────────┐                                                │
│  │   START     │ ◀────────────────────────────────────────────┐  │
│  │  User Goal  │                                              │  │
│  └──────┬──────┘                                              │  │
│         │                                                      │  │
│         ▼                                                      │  │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐   │  │
│  │   PLAN      │────▶│   EXECUTE    │────▶│   OBSERVE    │   │  │
│  │             │     │              │     │              │   │  │
│  │ • 分解目标   │     │ • 调用工具    │     │ • 收集结果    │   │  │
│  │ • 制定步骤   │     │ • 生成内容    │     │ • 评估质量    │   │  │
│  │ • 预估资源   │     │ • 记录进度    │     │ • 对比预期    │   │  │
│  │ • 识别风险   │     │ • 更新状态    │     │ • 发现异常    │   │  │
│  └─────────────┘     └──────────────┘     └──────┬───────┘   │  │
│                                                     │           │  │
│         ┌───────────────────────────────────────────┘           │  │
│         ▼                                                       │  │
│  ┌─────────────┐                                                │  │
│  │  REFLECT    │                                                │  │
│  │             │                                                │  │
│  │ • 目标达成？ │──── Yes ──▶ ┌─────────────┐                  │  │
│  │ • 质量合格？ │             │   REPORT    │                  │  │
│  │ • 有遗漏？   │             │  最终报告    │                  │  │
│  │ • 需要修正？ │             └─────────────┘                  │  │
│  │             │                                                 │  │
│  │ │ No        │                                                 │  │
│  │ ▼           │                                                 │  │
│  │ ┌─────────┐ │     ┌─────────────┐                           │  │
│  │ │ REVISE  │─┼────▶│   REPLAN    │──────────────────────────┘  │
│  │ │         │ │     │  调整计划    │                              │
│  │ │ 修正错误 │ │     │  补充步骤    │                              │
│  │ │ 优化方法 │ │     │  重新分配    │                              │
│  │ └─────────┘ │     └─────────────┘                              │
│  └─────────────┘                                                │
│                                                                  │
│  [终止条件]: 达到目标 / 超过最大迭代 / 用户中断 / 不可恢复错误      │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 自主Agent的System Prompt设计

```typescript
const autonomousSystemPrompt = `
# 自主Agent模式

你是一个高度自主的AI Agent。你可以在最小化用户指导的情况下，独立完成复杂的多步骤任务。

## 工作原则

### 1. 先理解，再行动
- 仔细分析用户的最终目标，而不仅仅是字面请求
- 识别隐含的需求和约束条件
- 如果目标不明确，主动提出澄清问题（仅限第一次交互）

### 2. 制定清晰计划
- 将复杂任务分解为可执行的子任务
- 为每个子任务设定明确的完成标准
- 识别子任务间的依赖关系
- 向用户展示你的计划概要

### 3. 系统化执行
- 严格按计划执行，但保留灵活调整的空间
- 每完成一个步骤后评估结果
- 使用合适的工具提高效率和准确性
- 记录关键发现和决策

### 4. 持续反思
- 定期检查：我是否偏离了目标？
- 评估：当前结果是否满足质量标准？
- 识别：有哪些遗漏或需要改进的地方？
- 调整：是否需要修改计划？

### 5. 质量保障
- 验证工具返回结果的准确性
- 交叉检查关键信息
- 确保最终输出完整且可直接使用
- 如果无法完成某些部分，明确说明

## 工具使用策略

- **搜索工具**：需要最新信息、数据验证、来源引用时使用
- **任务管理**：多步骤任务使用TaskPlan创建计划并跟踪进度
- **Skill工具**：需要专业知识或特定方法论时加载

## 输出规范

- 使用清晰的结构化格式（标题、列表、表格）
- 重要结论和发现用**加粗**标注
- 包含来源引用和参考链接
- 最后提供简洁的执行总结
`;
```

### 6.4 自主模式 vs 普通模式的区别

| 特性 | 普通模式 | 自主模式 |
|------|---------|---------|
| 循环次数 | 1-5次 | 无限制（直到完成） |
| 计划 | 可选 | 必须 |
| 工具调用 | 被动（LLM决定） | 主动（按计划执行） |
| 反思 | 无 | 每轮都有 |
| 进度跟踪 | 无 | TaskPlan实时更新 |
| 终止条件 | 无工具调用 | 目标达成确认 |
| 中间报告 | 无 | 每完成大步骤汇报 |
| 错误处理 | 失败即停止 | 重试+替代方案 |

### 6.5 实现方案

#### 6.5.1 自主模式API端点

```typescript
// POST /api/agent/chat/autonomous
interface AutonomousRequest {
  agentId: string;
  message: string;
  conversationId?: string;
  modelId?: string;
  skillIds?: string[];
  
  // 自主模式专属参数
  maxIterations?: number;     // 最大迭代次数（默认20）
  timeBudget?: number;         // 时间预算秒数（默认300）
  autoPlan: boolean;           // 是否自动制定计划（默认true）
  requireConfirmation: boolean; // 是否需要用户确认计划后执行
}
```

#### 6.5.2 自主循环实现

```typescript
async function autonomousLoop(params: {
  messages: LLMMessage[];
  tools: ToolDefinition[];
  maxIterations: number;
  timeBudget: number;
  sendSSE: (data: any) => void;
}): Promise<AutonomousResult> {
  const startTime = Date.now();
  let iteration = 0;
  let goalAchieved = false;
  const plan: TaskPlan | null = null;
  
  while (iteration < params.maxIterations) {
    // 检查时间预算
    if (Date.now() - startTime > params.timeBudget * 1000) {
      return { completed: false, reason: 'time_budget_exceeded' };
    }
    
    iteration++;
    
    // 1. Think（思考当前状态和下一步行动）
    const thought = await think(messages, iteration, plan);
    params.sendSSE({ type: 'thinking', content: thought, iteration });
    
    // 2. Act（执行工具调用或生成内容）
    const action = await act(messages, params.tools);
    
    // 3. Observe（观察结果）
    if (action.hasToolCalls) {
      const results = await executeTools(action.toolCalls);
      params.sendSSE({ type: 'tool_results', results });
      messages.push(...results.asMessages);
    }
    
    // 4. Reflect（反思）
    const reflection = await reflect(messages, plan);
    params.sendSSE({ type: 'reflection', content: reflection });
    
    if (reflection.goalAchieved) {
      goalAchieved = true;
      break;
    }
    
    if (reflection.needsReplan) {
      // 重新规划
      const newPlan = await replan(messages, reflection);
      params.sendSSE({ type: 'replan', plan: newPlan });
    }
    
    // 如果没有工具调用且有内容输出，检查是否完成
    if (!action.hasToolCalls && action.content) {
      params.sendSSE({ type: 'content', content: action.content });
      
      // 向用户确认是否满意（可选）
      if (params.requireConfirmation && iteration > 1) {
        const userSatisfied = await checkUserSatisfaction();
        if (userSatisfied) break;
      }
    }
  }
  
  return { completed: goalAchieved, iterations: iteration };
}
```

---

## 七、跨层共享组件

### 7.1 上下文管理器（Context Manager）

```typescript
class ContextManager {
  private messages: LLMMessage[] = [];
  private tokenBudget: number;
  
  // 智能裁剪：当token超限时，优先保留：
  // 1. System prompt
  // 2. 最近的用户消息
  // 3. 最近的助手回复（带thinking和工具调用）
  // 4. 早期的对话摘要（而非原文）
  trimToFitBudget(): void { ... }
  
  // 摘要生成：将早期对话压缩为摘要
  summarizeOldMessages(keepLast: number): void { ... }
  
  // 上下文注入：动态添加相关信息
  injectContext(context: ContextBlock): void { ... }
}
```

### 7.2 工具执行器增强

```typescript
class EnhancedToolExecutor {
  // 工具执行带超时和重试
  async executeWithRetry(
    tool: string,
    args: any,
    maxRetries: number = 1
  ): Promise<ToolResult> { ... }
  
  // 工具结果验证
  validateResult(tool: string, result: string): ValidationResult { ... }
  
  // 工具使用统计
  recordUsage(tool: string, success: boolean, duration: number): void { ... }
}
```

### 7.3 消息构建器（Message Builder）

```typescript
class MessageBuilder {
  // 构建增强型system prompt
  buildSystemPrompt(config: {
    agent: AgentConfig;
    mode: 'normal' | 'autonomous' | 'collaborative';
    intent?: UserIntent;
    skills?: SkillIndex[];
    taskPlan?: TaskPlan;
  }): string { ... }
  
  // 构建工具调用消息
  buildToolCallMessage(calls: ToolCall[]): LLMMessage { ... }
  
  // 构建工具结果消息
  buildToolResultMessage(results: ToolResult[]): LLMMessage { ... }
}
```

---

## 八、实施路线图

### Phase 1: 基础能力增强（当前迭代）
- [x] 数据库持久化修复
- [x] 思考过程显示/折叠
- [ ] **System Prompt优化**：增强角色定义和行为引导
- [ ] **工具描述优化**：从技术API文档风格改为使用指导风格
- [ ] **增强型ReAct循环**：添加Reflection步骤
- [ ] **工具结果摘要**：过长结果自动截断

### Phase 2: Skill系统升级
- [ ] **Skill轻量化**：System prompt中只放索引
- [ ] **动态Skill加载**：通过Skill工具按需加载
- [ ] **Skill推荐**：根据用户意图推荐相关skill

### Phase 3: 多Agent协同升级
- [ ] **任务分解图**：DAG结构代替简单列表
- [ ] **并行执行引擎**：Promise.all并行
- [ ] **质量门控**：每层结果自动评估
- [ ] **专业化Prompt**：根据角色和任务定制

### Phase 4: 自主Agent
- [ ] **自主模式API**：新端点 /api/agent/chat/autonomous
- [ ] **自主循环**：Plan→Execute→Observe→Reflect
- [ ] **进度追踪**：TaskPlan实时更新
- [ ] **用户确认机制**：可选的中间确认点
- [ ] **时间预算**：超时自动停止和总结

---

## 九、关键设计决策

1. **渐进式复杂度**：从Level 1到Level 5逐步叠加能力，不是一次性重写
2. **向后兼容**：所有改进都在现有API框架内，不需要破坏性变更
3. **Prompt Engineering为主**：大部分改进通过优化prompt实现，不需要新的模型
4. **SSE流式体验**：所有模式都保持流式输出，用户体验一致
5. **Token效率**：通过智能裁剪、按需加载、结果摘要来控制token使用
6. **错误恢复**：每个层级都有错误处理和恢复机制
7. **可观测性**：所有agent行为（工具调用、skill加载、规划决策）都通过SSE推送给前端
