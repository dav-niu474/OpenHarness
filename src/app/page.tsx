'use client';

import React from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Wrench,
  BookOpen,
  Users,
  Brain,
  Shield,
  ListTodo,
  Cpu,
} from 'lucide-react';
import { useAgentStore, type Page } from '@/stores/agent-store';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';

import DashboardPage from '@/components/pages/DashboardPage';
import PlaygroundPage from '@/components/pages/PlaygroundPage';
import ToolsPage from '@/components/pages/ToolsPage';
import SkillsPage from '@/components/pages/SkillsPage';
import SwarmPage from '@/components/pages/SwarmPage';
import MemoryPage from '@/components/pages/MemoryPage';
import PermissionsPage from '@/components/pages/PermissionsPage';
import TasksPage from '@/components/pages/TasksPage';

// ── Navigation config ─────────────────────────────────────────

interface NavItem {
  page: Page;
  label: string;
  description: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  {
    page: 'dashboard',
    label: 'Dashboard',
    description: 'System overview and metrics',
    icon: LayoutDashboard,
  },
  {
    page: 'playground',
    label: 'Agent Playground',
    description: 'Chat with agents',
    icon: MessageSquare,
  },
  {
    page: 'tools',
    label: 'Tool Registry',
    description: 'Manage agent tools',
    icon: Wrench,
  },
  {
    page: 'skills',
    label: 'Skills',
    description: 'Agent skill library',
    icon: BookOpen,
  },
  {
    page: 'swarm',
    label: 'Swarm',
    description: 'Multi-agent coordination',
    icon: Users,
  },
  {
    page: 'memory',
    label: 'Memory',
    description: 'Persistent memory system',
    icon: Brain,
  },
  {
    page: 'permissions',
    label: 'Permissions',
    description: 'Access control policies',
    icon: Shield,
  },
  {
    page: 'tasks',
    label: 'Task Manager',
    description: 'Task queue and progress',
    icon: ListTodo,
  },
];

// ── Page renderer ─────────────────────────────────────────────

function PageContent({ page }: { page: Page }) {
  switch (page) {
    case 'dashboard':
      return <DashboardPage />;
    case 'playground':
      return <PlaygroundPage />;
    case 'tools':
      return <ToolsPage />;
    case 'skills':
      return <SkillsPage />;
    case 'swarm':
      return <SwarmPage />;
    case 'memory':
      return <MemoryPage />;
    case 'permissions':
      return <PermissionsPage />;
    case 'tasks':
      return <TasksPage />;
  }
}

// ── Sidebar navigation ────────────────────────────────────────

function AppSidebar() {
  const { activePage, setActivePage } = useAgentStore();

  return (
    <Sidebar collapsible="icon">
      {/* ── Branding ──────────────────────────────────────── */}
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 shrink-0">
            <Cpu className="w-4.5 h-4.5 text-emerald-400" />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold text-zinc-100 tracking-tight">
              OpenHarness
            </span>
            <span className="text-[11px] text-zinc-500 font-medium">
              Agent System
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* ── Navigation items ─────────────────────────────── */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-zinc-500 group-data-[collapsible=icon]:hidden">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.page;

                return (
                  <SidebarMenuItem key={item.page}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={{
                        children: (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{item.label}</span>
                            <span className="text-xs text-zinc-400">
                              {item.description}
                            </span>
                          </div>
                        ),
                      }}
                      onClick={() => setActivePage(item.page)}
                      className={`
                        ${isActive
                          ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                          : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60'
                        }
                      `}
                    >
                      <Icon className="shrink-0" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer with system status ────────────────────── */}
      <SidebarFooter className="px-4 py-3">
        <div className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-xs font-medium text-zinc-400">
              System Online
            </span>
            <span className="text-[10px] text-zinc-600">
              All agents operational
            </span>
          </div>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

// ── Main page ─────────────────────────────────────────────────

export default function Home() {
  const { activePage } = useAgentStore();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* ── Top bar ────────────────────────────────────── */}
        <header className="flex items-center gap-3 border-b border-border px-6 py-3 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <SidebarTrigger className="-ml-2 text-muted-foreground hover:text-foreground" />
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            {(() => {
              const item = NAV_ITEMS.find((n) => n.page === activePage);
              const Icon = item?.icon ?? LayoutDashboard;
              return (
                <>
                  <Icon className="w-4 h-4 text-emerald-500" />
                  <h2 className="text-sm font-medium">{item?.label ?? ''}</h2>
                </>
              );
            })()}
          </div>
        </header>

        {/* ── Page content ───────────────────────────────── */}
        <div className="flex-1 overflow-auto">
          <PageContent page={activePage} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
