import { NextRequest } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';
import { chatStream, getModelInfo, type LLMMessage } from '@/lib/llm';
import { getToolDefinitions, executeTool, type ToolContext } from '@/lib/tools';

export const dynamic = 'force-dynamic';

const MAX_AGENT_LOOP_ITERATIONS = 5;

export async function POST(req: NextRequest) {
  try {
    await ensureDatabase();
    const { agentId, message, conversationId, modelId, model, skillIds, autonomous } = await req.json();
    const effectiveModelReqId = modelId || model;

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Map short agent IDs to DB IDs
    const agentIdMap: Record<string, string> = {
      alpha: 'seed-alpha',
      beta: 'seed-beta',
      gamma: 'seed-gamma',
    };
    const dbAgentId = agentIdMap[agentId] || agentId || null;

    // Determine model
    let effectiveModelId = effectiveModelReqId || 'z-ai/glm4.7';
    let systemPrompt =
      'You are OpenHarness AI Agent, a highly capable and intelligent assistant. You excel at:\n\n' +
      '## Core Capabilities\n' +
      '1. **Complex Problem Solving** — Break down complex problems into clear, actionable steps before solving them\n' +
      '2. **Tool Usage** — Use available tools (WebSearch, TaskManager, etc.) proactively when they add value\n' +
      '3. **Code Analysis** — Write, debug, and explain code with clear reasoning\n' +
      '4. **Research & Synthesis** — Search for information, analyze it, and present well-structured summaries\n\n' +
      '## Response Style\n' +
      '- Be concise but thorough. Don\'t repeat yourself.\n' +
      '- Use markdown formatting: headers, lists, code blocks, tables\n' +
      '- When writing code, always include brief explanations\n' +
      '- If you\'re unsure about something, say so honestly\n' +
      '- Think step-by-step for complex problems before answering';

    let agentData: { agentMd?: string; soulPrompt?: string; boundSkills?: string } | null = null;

    if (dbAgentId) {
      const agent = await db.agent.findUnique({ where: { id: dbAgentId } });
      if (agent) {
        systemPrompt = agent.systemPrompt || systemPrompt;
        agentData = {
          agentMd: agent.agentMd || '',
          soulPrompt: agent.soulPrompt || '',
          boundSkills: agent.boundSkills || '[]',
        };
        if (!modelId && agent.provider && agent.model) {
          if (agent.provider === 'nvidia') {
            effectiveModelId = agent.model;
          }
        }
      }
    }

    // ── Inject skills into system prompt ───────────────────────
    const skillIdsToFetch: string[] = [];

    if (Array.isArray(skillIds) && skillIds.length > 0) {
      skillIdsToFetch.push(...skillIds);
    }

    if (agentData?.boundSkills) {
      try {
        const bound: string[] = JSON.parse(agentData.boundSkills);
        if (Array.isArray(bound)) {
          for (const id of bound) {
            if (!skillIdsToFetch.includes(id)) {
              skillIdsToFetch.push(id);
            }
          }
        }
      } catch { /* skip */ }
    }

    let skillSection = '';
    if (skillIdsToFetch.length > 0) {
      const skills = await db.skill.findMany({
        where: { id: { in: skillIdsToFetch } },
      });

      if (skills.length > 0) {
        const skillLines = skills.map((s) => {
          const cat = s.category || 'general';
          const desc = s.description || '';
          return `- **${s.name}**: ${desc} (${cat})\n  Content: ${s.content}`;
        }).join('\n\n');

        skillSection = `\n\n## Available Skills\nThe following skills are loaded and available to you:\n${skillLines}\n\nYou should use these skills when relevant to the user's request.`;
      }
    }

    // ── Inject agent persona and soul ─────────────────────────
    let personaSection = '';
    if (agentData?.agentMd) {
      personaSection += `\n\n## Agent Persona (agent.md)\n${agentData.agentMd}`;
    }
    if (agentData?.soulPrompt) {
      personaSection += `\n\n## Soul/Core Personality (soul.md)\n${agentData.soulPrompt}`;
    }

    // ── Inject Working Methodology for task decomposition ──────
    const methodologySection = `

## Working Methodology — IMPORTANT

When faced with a **complex task** (anything requiring multiple steps, research, code changes, data analysis, or coordination), you MUST follow this structured approach:

### Step 1: Analyze & Decompose
Before answering, think about what the user is really asking. Break the request into clear sub-tasks:
- What information do I need?
- What steps are required?
- What tools should I use?
- Are there dependencies between steps?

### Step 2: Present Your Plan
Before diving into execution, briefly outline your approach. For example:
> I'll approach this in 3 steps:
> 1. First, I'll search for...
> 2. Then, I'll analyze...
> 3. Finally, I'll summarize...

### Step 3: Execute Systematically
- Use available tools (WebSearch, TaskManager, etc.) when they add value
- Show your work — don't just give the final answer
- For code: explain what you're doing and why
- For research: cite your sources

### Step 4: Verify & Summarize
- Check your work for errors
- Provide a clear, actionable summary
- If the task is incomplete, explain what's left

**For simple questions** (single lookup, quick fact, greeting): respond directly without a plan.

**Key Principle**: Show your reasoning. Users value understanding HOW you arrived at an answer, not just the answer itself.`;

    const finalSystemPrompt = systemPrompt + personaSection + skillSection + methodologySection;
    const modelInfo = getModelInfo(effectiveModelId);

    // ── Build messages array ──────────────────────────────────
    const messages: LLMMessage[] = [{ role: 'system', content: finalSystemPrompt }];

    let dbConversationId: string | null = null;
    if (conversationId) {
      const conversation = await db.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            select: { role: true, content: true, thinking: true, toolCalls: true, toolResults: true },
          },
        },
      });

      if (conversation) {
        dbConversationId = conversation.id;
        for (const msg of conversation.messages) {
          if (msg.role !== 'system' && msg.content) {
            messages.push({ role: msg.role as LLMMessage['role'], content: msg.content });
          }
        }
      }
    }

    messages.push({ role: 'user', content: message });

    // Save user message
    if (dbConversationId) {
      try {
        await db.message.create({
          data: { conversationId: dbConversationId, role: 'user', content: message },
        });
      } catch (err) {
        console.error('Failed to save user message:', err);
      }
    }

    // ── Get tool definitions ──────────────────────────────────
    const toolDefs = getToolDefinitions();

    // ── Create SSE ReadableStream with Agent Loop ─────────────
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readable = new ReadableStream({
      async start(controller) {
        let fullContent = '';
        let fullThinking = '';
        let usageData: Record<string, number> | null = null;
        const toolToolContext: ToolContext = { agentId: dbAgentId || undefined, conversationId: dbConversationId || undefined };
        const allExecutedToolCalls: Array<{ id: string; name: string; arguments: string; result: string; success: boolean; duration: number }> = [];
        let loopIteration = 0;
        let isPlanningPhase = false;
        let lastTaskPlanEvent: { title: string; steps: string[]; complexity: string; completedSteps: number[] } | null = null;

        try {
          // ── Agent Loop ────────────────────────────────────────
          while (loopIteration < MAX_AGENT_LOOP_ITERATIONS) {
            loopIteration++;

            // Notify about loop iteration
            if (loopIteration > 1) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'loop_iteration', iteration: loopIteration, maxIterations: MAX_AGENT_LOOP_ITERATIONS, model: modelInfo.name })}\n\n`
                )
              );
            }

            const providerStream = await chatStream(messages, effectiveModelId, toolDefs);
            const reader = providerStream.getReader();
            let buffer = '';
            const toolCallsAccumulator: Record<string, { id: string; name: string; arguments: string }> = {};
            let iterationThinking = '';
            let iterationContent = '';
            let hasToolCalls = false;

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed) continue;
                  if (trimmed === 'data: [DONE]') continue;

                  if (trimmed.startsWith('data: ')) {
                    try {
                      const json = JSON.parse(trimmed.slice(6));
                      const delta = json.choices?.[0]?.delta;

                      // Thinking
                      const thinkingContent = delta?.reasoning_content;
                      if (thinkingContent) {
                        fullThinking += thinkingContent;
                        iterationThinking += thinkingContent;
                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify({ type: 'thinking', content: thinkingContent, model: modelInfo.name })}\n\n`
                          )
                        );
                      }

                      // Regular content
                      const content = delta?.content;
                      if (content) {
                        fullContent += content;
                        iterationContent += content;

                        // Detect planning phase: check if content contains checkbox markers
                        const currentContent = fullContent;
                        if (!isPlanningPhase && (currentContent.includes('- [ ]') || currentContent.includes('Task Plan'))) {
                          isPlanningPhase = true;
                          controller.enqueue(
                            encoder.encode(
                              `data: ${JSON.stringify({ type: 'planning', content: 'Agent is creating a task plan...' })}\n\n`
                            )
                          );
                        }

                        controller.enqueue(
                          encoder.encode(
                            `data: ${JSON.stringify({ type: 'token', content, model: modelInfo.name })}\n\n`
                          )
                        );
                      }

                      // Tool calls
                      const toolCalls = delta?.tool_calls;
                      if (toolCalls && Array.isArray(toolCalls)) {
                        hasToolCalls = true;
                        for (const tc of toolCalls) {
                          if (tc.id) {
                            toolCallsAccumulator[tc.index ?? 0] = {
                              id: tc.id,
                              name: tc.function?.name || 'unknown',
                              arguments: tc.function?.arguments || '',
                            };
                          } else if (toolCallsAccumulator[tc.index ?? 0]) {
                            toolCallsAccumulator[tc.index ?? 0].arguments += (tc.function?.arguments || '');
                          }

                          const acc = toolCallsAccumulator[tc.index ?? 0];
                          if (acc) {
                            controller.enqueue(
                              encoder.encode(
                                `data: ${JSON.stringify({
                                  type: 'tool_call',
                                  toolCallId: acc.id,
                                  name: acc.name,
                                  arguments: acc.arguments,
                                  done: !tc.function?.arguments,
                                  iteration: loopIteration,
                                })}\n\n`
                              )
                            );
                          }
                        }
                      }

                      if (json.usage) {
                        usageData = json.usage;
                      }
                    } catch {
                      // Not valid JSON
                    }
                  }
                }
              }

              // Process remaining buffer
              if (buffer.trim()) {
                const trimmed = buffer.trim();
                if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
                  try {
                    const json = JSON.parse(trimmed.slice(6));
                    const delta = json.choices?.[0]?.delta;
                    const thinkingContent = delta?.reasoning_content;
                    if (thinkingContent) {
                      fullThinking += thinkingContent;
                      iterationThinking += thinkingContent;
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify({ type: 'thinking', content: thinkingContent, model: modelInfo.name })}\n\n`
                        )
                      );
                    }
                    const content = delta?.content;
                    if (content) {
                      fullContent += content;
                      iterationContent += content;
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: 'token', content, model: modelInfo.name })}\n\n`)
                      );
                    }
                    if (json.usage) usageData = json.usage;
                  } catch { /* skip */ }
                }
              }
            } finally {
              reader.releaseLock();
            }

            // ── If no tool calls, we're done ──────────────────
            const completedToolCalls = Object.values(toolCallsAccumulator);
            if (completedToolCalls.length === 0) {
              break;
            }

            // ── Execute tool calls ─────────────────────────────
            // Add assistant message with tool_calls to conversation
            messages.push({
              role: 'assistant',
              content: iterationContent || '',
              tool_calls: completedToolCalls.map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.name, arguments: tc.arguments },
              })),
            });

            // End planning phase when tool calls are present (agent is executing)
            if (isPlanningPhase) {
              isPlanningPhase = false;
            }

            // Execute each tool call
            for (const tc of completedToolCalls) {
              const startTime = Date.now();

              // Send special task_plan event for TaskPlan tool calls
              if (tc.name === 'TaskPlan') {
                let parsedArgs: Record<string, unknown> = {};
                try {
                  parsedArgs = JSON.parse(tc.arguments);
                } catch { /* keep empty */ }
                const planTitle = String(parsedArgs.title || 'Untitled Plan');
                const planSteps = Array.isArray(parsedArgs.steps) ? parsedArgs.steps.map((s: unknown) => String(s)) : [];
                const planComplexity = String(parsedArgs.complexity || 'moderate');

                // Send task_plan SSE event
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'task_plan',
                      title: planTitle,
                      steps: planSteps,
                      complexity: planComplexity,
                      completedSteps: [],
                    })}\n\n`
                  )
                );
                lastTaskPlanEvent = { title: planTitle, steps: planSteps, complexity: planComplexity, completedSteps: [] };
              }
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'tool_executing', toolCallId: tc.id, name: tc.name })}\n\n`
                )
              );

              let parsedArgs: Record<string, unknown> = {};
              try {
                parsedArgs = JSON.parse(tc.arguments);
              } catch { /* keep empty */ }

              const result = await executeTool(tc.name, parsedArgs, toolToolContext);
              const duration = Date.now() - startTime;

              allExecutedToolCalls.push({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
                result: result.success ? result.result : result.error || 'Unknown error',
                success: result.success,
                duration,
              });

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'tool_result',
                    toolCallId: tc.id,
                    name: tc.name,
                    result: result.success ? result.result : result.error || 'Unknown error',
                    success: result.success,
                    duration,
                    iteration: loopIteration,
                  })}\n\n`
                )
              );

              // Add tool result to messages
              messages.push({
                role: 'tool',
                content: result.success ? result.result : `Error: ${result.error || 'Unknown error'}`,
                tool_call_id: tc.id,
              });
            }
          }

          // ── Send final done event ────────────────────────────
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
                usage: usageData,
                model: modelInfo.name,
                modelId: modelInfo.id,
                provider: modelInfo.provider,
                thinkingLength: fullThinking.length,
                toolCalls: allExecutedToolCalls.length > 0 ? allExecutedToolCalls : undefined,
                loopIterations: loopIteration,
                autonomous: !!autonomous,
              })}\n\n`
            )
          );
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'done', error: String(error) })}\n\n`
            )
          );
        } finally {
          // Save assistant message with full metadata
          if (dbConversationId && (fullContent || fullThinking)) {
            try {
              const toolCallsJson = allExecutedToolCalls.length > 0
                ? JSON.stringify(allExecutedToolCalls.map(tc => ({
                    id: tc.id,
                    tool: tc.name,
                    input: (() => { try { return JSON.parse(tc.arguments); } catch { return {}; } })(),
                    result: tc.result,
                    status: tc.success ? 'success' : 'error',
                    duration: tc.duration,
                  })))
                : '[]';
              const toolResultsJson = allExecutedToolCalls.length > 0
                ? JSON.stringify(allExecutedToolCalls.map(tc => ({
                    toolCallId: tc.id,
                    name: tc.name,
                    result: tc.result,
                    success: tc.success,
                    duration: tc.duration,
                  })))
                : '[]';

              await db.message.create({
                data: {
                  conversationId: dbConversationId,
                  role: 'assistant',
                  content: fullContent,
                  thinking: fullThinking,
                  toolCalls: toolCallsJson,
                  toolResults: toolResultsJson,
                  tokenCount: usageData?.total_tokens,
                },
              });
            } catch (dbError) {
              console.error('Failed to save assistant message:', dbError);
            }
          }

          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Agent chat stream error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
