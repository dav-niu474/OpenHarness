import { NextResponse } from 'next/server';
import { db, ensureDatabase } from '@/lib/db';

// GET /api/stats - Dashboard statistics
export async function GET() {
  try {
    await ensureDatabase();
    // Run all queries in parallel for performance
    const [
      activeAgents,
      totalAgents,
      availableTools,
      enabledTools,
      runningTasks,
      totalTasks,
      totalMemories,
      totalConversations,
      totalMessages,
      completedTasks,
      failedTasks,
      pendingTasks,
      loadedSkills,
      totalSkills,
      totalTeams,
      activeTeams,
    ] = await Promise.all([
      db.agent.count({ where: { status: 'active' } }),
      db.agent.count(),
      db.tool.count(),
      db.tool.count({ where: { isEnabled: true } }),
      db.task.count({ where: { status: 'in_progress' } }),
      db.task.count(),
      db.memory.count(),
      db.conversation.count({ where: { status: 'active' } }),
      db.message.count(),
      db.task.count({ where: { status: 'completed' } }),
      db.task.count({ where: { status: 'failed' } }),
      db.task.count({ where: { status: 'pending' } }),
      db.skill.count({ where: { isLoaded: true } }),
      db.skill.count(),
      db.agentTeam.count(),
      db.agentTeam.count(),
    ]);

    // Recent activity - last 10 messages with agent info
    const recentMessages = await db.message.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        conversation: {
          select: {
            title: true,
            agent: {
              select: { name: true },
            },
          },
        },
      },
    });

    const recentActivity = recentMessages.map((msg) => ({
      id: msg.id,
      type: msg.role === 'user' ? 'message_sent' : msg.role === 'assistant' ? 'agent_response' : 'system_event',
      agentName: msg.conversation.agent.name,
      conversationTitle: msg.conversation.title,
      content: msg.content.substring(0, 120) + (msg.content.length > 120 ? '...' : ''),
      timestamp: msg.createdAt,
    }));

    // Task distribution by status
    const taskDistribution = {
      pending: pendingTasks,
      in_progress: runningTasks,
      completed: completedTasks,
      failed: failedTasks,
    };

    // Agent status distribution
    const agentStatuses = await db.agent.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    const agentDistribution = Object.fromEntries(
      agentStatuses.map((a) => [a.status, a._count.status])
    );

    return NextResponse.json({
      success: true,
      data: {
        // Core counts
        activeAgents,
        totalAgents,
        availableTools,
        enabledTools,
        runningTasks,
        totalTasks,
        totalMemories,
        totalConversations,
        totalMessages,
        loadedSkills,
        totalSkills,
        totalTeams,
        activeTeams,

        // Derived stats
        taskSuccessRate: totalTasks > 0
          ? Math.round((completedTasks / (completedTasks + failedTasks)) * 100)
          : 0,
        avgProgress: runningTasks > 0
          ? Math.round(
              (
                await db.task.findMany({
                  where: { status: 'in_progress' },
                  select: { progress: true },
                })
              ).reduce((sum, t) => sum + t.progress, 0) / runningTasks
            )
          : 0,

        // Distribution data
        taskDistribution,
        agentDistribution,

        // Recent activity
        recentActivity,
      },
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
