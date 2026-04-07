'use client';

import { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  GitCommitHorizontal,
  Eye,
  Bug,
  Map,
  TestTube2,
  Minimize2,
  FileText,
  Table2,
  FilePenLine,
  Presentation,
  Globe,
  BookOpenCheck,
  Microscope,
  MessageSquareQuote,
  Languages,
  ChevronRight,
  Sparkles,
  Check,
  X,
  Zap,
  FolderSync,
  ListChecks,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

// ── Types ──────────────────────────────────────────────────────

type SkillCategory = 'Development' | 'Document' | 'Research' | 'Communication';

interface SkillItem {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  fullDescription: string;
  whenToUse: string;
  workflow: string[];
  plugins: string[];
  loaded: boolean;
  version: string;
  author: string;
  icon: React.ReactNode;
}

// ── Category Config ────────────────────────────────────────────

const categoryConfig: Record<
  SkillCategory,
  { color: string; bg: string; border: string; badge: string }
> = {
  Development: {
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
    border: 'border-l-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  Document: {
    color: 'text-amber-600',
    bg: 'bg-amber-500/10',
    border: 'border-l-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  Research: {
    color: 'text-sky-600',
    bg: 'bg-sky-500/10',
    border: 'border-l-sky-500',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  Communication: {
    color: 'text-violet-600',
    bg: 'bg-violet-500/10',
    border: 'border-l-violet-500',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
  },
};

// ── Mock Data ──────────────────────────────────────────────────

const allSkills: SkillItem[] = [
  // Development Skills
  {
    id: 'commit',
    name: 'commit',
    category: 'Development',
    description:
      'Create clean, well-structured git commits with proper messages, grouping related changes and following conventional commit conventions.',
    fullDescription:
      'The commit skill helps agents create meaningful, well-structured git commits. It analyzes staged changes, generates conventional commit messages, groups related file changes, and ensures commits are atomic and descriptive.',
    whenToUse:
      'Use when you have finished making code changes and need to commit them to git. Especially useful for complex changes spanning multiple files.',
    workflow: [
      'Review all staged and unstaged changes',
      'Analyze the nature of changes (feature, fix, refactor, etc.)',
      'Group related changes into logical commits',
      'Generate conventional commit messages',
      'Stage appropriate files and create commits',
    ],
    plugins: ['bash', 'read', 'grep'],
    loaded: true,
    version: '1.2.0',
    author: 'OpenHarness Core',
    icon: <GitCommitHorizontal className="w-4 h-4" />,
  },
  {
    id: 'review',
    name: 'review',
    category: 'Development',
    description:
      'Review code for bugs, security issues, performance problems, and code quality. Provides actionable feedback with severity ratings.',
    fullDescription:
      'Performs comprehensive code review including bug detection, security vulnerability scanning, performance analysis, and adherence to best practices. Returns structured feedback with severity ratings and suggested fixes.',
    whenToUse:
      'Use when you need to review code before merging, after implementation, or when mentoring. Also useful for auditing existing codebases.',
    workflow: [
      'Read and parse the target code files',
      'Check for common bug patterns and anti-patterns',
      'Scan for security vulnerabilities',
      'Analyze performance characteristics',
      'Generate structured review report with severity ratings',
    ],
    plugins: ['read', 'grep', 'glob'],
    loaded: true,
    version: '2.1.0',
    author: 'OpenHarness Core',
    icon: <Eye className="w-4 h-4" />,
  },
  {
    id: 'debug',
    name: 'debug',
    category: 'Development',
    description:
      'Diagnose and fix bugs systematically using log analysis, stack trace parsing, and hypothesis-driven debugging methodology.',
    fullDescription:
      'Applies systematic debugging methodology to identify and fix bugs. Includes log analysis, stack trace parsing, state inspection, and hypothesis-driven investigation. Creates reproduction steps and validates fixes.',
    whenToUse:
      'Use when encountering errors, unexpected behavior, or when users report bugs. Particularly effective for complex, multi-system issues.',
    workflow: [
      'Gather error messages, logs, and stack traces',
      'Identify the failing component and code path',
      'Form hypotheses about root cause',
      'Test hypotheses by reading code and running diagnostics',
      'Implement and validate the fix',
    ],
    plugins: ['bash', 'read', 'grep', 'edit'],
    loaded: true,
    version: '1.5.0',
    author: 'OpenHarness Core',
    icon: <Bug className="w-4 h-4" />,
  },
  {
    id: 'plan',
    name: 'plan',
    category: 'Development',
    description:
      'Design comprehensive implementation plans before coding, breaking down complex tasks into manageable steps with clear dependencies.',
    fullDescription:
      'Creates detailed implementation plans for complex features. Breaks down work into sequential and parallel tasks, identifies dependencies, estimates effort, and outlines the technical approach with architecture decisions.',
    whenToUse:
      'Use before starting any non-trivial implementation. Essential for features requiring multiple files, architectural changes, or cross-component work.',
    workflow: [
      'Analyze requirements and constraints',
      'Identify affected components and files',
      'Break down into implementation tasks',
      'Map dependencies between tasks',
      'Create step-by-step execution plan with checkpoints',
    ],
    plugins: ['glob', 'read', 'grep'],
    loaded: false,
    version: '1.3.0',
    author: 'OpenHarness Core',
    icon: <Map className="w-4 h-4" />,
  },
  {
    id: 'test',
    name: 'test',
    category: 'Development',
    description:
      'Write and run comprehensive tests for code including unit tests, integration tests, and end-to-end tests with proper assertions.',
    fullDescription:
      'Generates and executes tests for code using appropriate testing frameworks. Creates unit tests, integration tests, and end-to-end tests. Ensures proper coverage of edge cases, error handling, and happy paths.',
    whenToUse:
      'Use after implementing features to ensure correctness. Also useful for adding tests to existing untested code or when debugging failing tests.',
    workflow: [
      'Analyze the code to understand expected behavior',
      'Identify test cases including edge cases',
      'Generate test code with proper assertions',
      'Run tests and analyze results',
      'Fix any failing tests and iterate',
    ],
    plugins: ['bash', 'read', 'write', 'edit'],
    loaded: true,
    version: '1.4.0',
    author: 'OpenHarness Core',
    icon: <TestTube2 className="w-4 h-4" />,
  },
  {
    id: 'simplify',
    name: 'simplify',
    category: 'Development',
    description:
      'Refactor code to be simpler, more maintainable, and more readable while preserving behavior. Applies clean code principles.',
    fullDescription:
      'Refactors code for improved readability and maintainability. Applies clean code principles, removes duplication, simplifies complex logic, improves naming, and ensures consistent patterns across the codebase.',
    whenToUse:
      'Use when code is overly complex, hard to understand, or during regular maintenance. Ideal for improving code quality without changing functionality.',
    workflow: [
      'Analyze code complexity and identify issues',
      'Propose specific refactoring improvements',
      'Apply changes incrementally with validation',
      'Ensure all tests still pass',
      'Document significant structural changes',
    ],
    plugins: ['read', 'edit', 'bash', 'grep'],
    loaded: false,
    version: '1.1.0',
    author: 'OpenHarness Core',
    icon: <Minimize2 className="w-4 h-4" />,
  },

  // Document Skills
  {
    id: 'pdf',
    name: 'pdf',
    category: 'Document',
    description:
      'PDF processing capabilities including text extraction, form filling, page manipulation, merging, and splitting documents.',
    fullDescription:
      'Comprehensive PDF manipulation toolkit powered by pypdf. Supports text extraction, form filling, page reordering, merging multiple PDFs, splitting documents, and adding annotations. Handles both text-based and scanned PDFs.',
    whenToUse:
      'Use when you need to read, modify, create, or process PDF files. Common scenarios include extracting data from PDFs, filling forms, or generating reports.',
    workflow: [
      'Open and parse the PDF document',
      'Perform the requested operation (extract, merge, fill, etc.)',
      'Process pages or content as needed',
      'Save or return the modified document',
    ],
    plugins: ['read', 'write', 'bash'],
    loaded: true,
    version: '2.0.0',
    author: 'OpenHarness Docs',
    icon: <FileText className="w-4 h-4" />,
  },
  {
    id: 'xlsx',
    name: 'xlsx',
    category: 'Document',
    description:
      'Excel spreadsheet operations including reading, writing, formatting, formula application, and data visualization within workbooks.',
    fullDescription:
      'Full Excel file support including reading/writing .xlsx, .xlsm, .csv files. Supports cell formatting, formulas, charts, pivot tables, conditional formatting, and data validation. Provides both row-by-row and batch processing modes.',
    whenToUse:
      'Use when working with spreadsheet data, creating reports, processing CSV files, or generating formatted Excel output with charts and formulas.',
    workflow: [
      'Open or create the spreadsheet file',
      'Read existing data or set up structure',
      'Apply formatting, formulas, or data operations',
      'Save the workbook with all changes',
    ],
    plugins: ['read', 'write', 'bash'],
    loaded: true,
    version: '1.8.0',
    author: 'OpenHarness Docs',
    icon: <Table2 className="w-4 h-4" />,
  },
  {
    id: 'docx',
    name: 'docx',
    category: 'Document',
    description:
      'Word document creation and editing with support for formatting, styles, tables, images, headers/footers, and tracked changes.',
    fullDescription:
      'Creates and modifies Word documents (.docx) with full formatting support. Includes styled text, tables, images, headers/footers, page numbers, tracked changes, comments, and sections. Preserves existing formatting when editing.',
    whenToUse:
      'Use when creating professional documents, reports, or when editing existing Word files. Supports both new document creation and modification of existing documents.',
    workflow: [
      'Create or load the document template',
      'Add or modify content with proper formatting',
      'Apply styles, tables, and media elements',
      'Save the final document',
    ],
    plugins: ['read', 'write'],
    loaded: false,
    version: '1.6.0',
    author: 'OpenHarness Docs',
    icon: <FilePenLine className="w-4 h-4" />,
  },
  {
    id: 'pptx',
    name: 'pptx',
    category: 'Document',
    description:
      'Presentation creation and editing with slide layouts, animations, transitions, charts, images, and speaker notes.',
    fullDescription:
      'Creates and modifies PowerPoint presentations with rich content support. Includes slide layouts, master slides, animations, transitions, embedded charts and images, speaker notes, and theme customization.',
    whenToUse:
      'Use when creating presentations, pitch decks, or when modifying existing PowerPoint files. Supports professional slide design with themes and animations.',
    workflow: [
      'Create or load the presentation',
      'Design slides with layouts and themes',
      'Add content, media, and animations',
      'Add speaker notes and save',
    ],
    plugins: ['read', 'write'],
    loaded: false,
    version: '1.4.0',
    author: 'OpenHarness Docs',
    icon: <Presentation className="w-4 h-4" />,
  },

  // Research Skills
  {
    id: 'web-search',
    name: 'web-search',
    category: 'Research',
    description:
      'Search the web for current information, news, documentation, and resources. Returns structured results with URLs and snippets.',
    fullDescription:
      'Performs web searches across multiple sources to find current, relevant information. Returns structured results including URLs, page titles, snippets, hostnames, and relevance rankings. Supports advanced search operators and result filtering.',
    whenToUse:
      'Use when you need up-to-date information, current events, latest documentation, or any data that may have changed since training cutoff.',
    workflow: [
      'Formulate effective search queries',
      'Execute searches with appropriate parameters',
      'Parse and rank results by relevance',
      'Return structured results with key information',
    ],
    plugins: ['web-search', 'web-fetch'],
    loaded: true,
    version: '2.2.0',
    author: 'OpenHarness Research',
    icon: <Globe className="w-4 h-4" />,
  },
  {
    id: 'web-reader',
    name: 'web-reader',
    category: 'Research',
    description:
      'Read and extract clean content from web pages including articles, documentation, and blog posts with metadata extraction.',
    fullDescription:
      'Fetches and intelligently extracts content from web pages. Removes boilerplate, ads, and navigation elements to return clean article text. Also extracts metadata like title, author, publication date, and main images.',
    whenToUse:
      'Use when you need to read the content of specific web pages, articles, or documentation. Ideal for processing URLs returned by web search.',
    workflow: [
      'Fetch the web page content',
      'Parse HTML and extract main content',
      'Clean up boilerplate and formatting',
      'Extract metadata and structure',
      'Return clean content with metadata',
    ],
    plugins: ['web-fetch'],
    loaded: true,
    version: '1.5.0',
    author: 'OpenHarness Research',
    icon: <BookOpenCheck className="w-4 h-4" />,
  },
  {
    id: 'research',
    name: 'research',
    category: 'Research',
    description:
      'Deep research and analysis combining web search, content extraction, synthesis, and structured report generation on any topic.',
    fullDescription:
      'Performs in-depth research on any topic by combining web search, content reading, cross-referencing, and analysis. Generates comprehensive research reports with citations, methodology notes, and confidence ratings for findings.',
    whenToUse:
      'Use for complex research tasks that require multiple sources, deep analysis, and structured output. Ideal for market research, technical analysis, or academic topics.',
    workflow: [
      'Define research scope and questions',
      'Search multiple sources systematically',
      'Read and extract key information',
      'Cross-reference and validate findings',
      'Synthesize into structured research report',
    ],
    plugins: ['web-search', 'web-fetch', 'bash'],
    loaded: false,
    version: '1.0.0',
    author: 'OpenHarness Research',
    icon: <Microscope className="w-4 h-4" />,
  },

  // Communication Skills
  {
    id: 'summarize',
    name: 'summarize',
    category: 'Communication',
    description:
      'Summarize long texts, documents, conversations, or code changes into concise, well-structured summaries with key takeaways.',
    fullDescription:
      'Creates concise summaries of long-form content while preserving key information, context, and actionable insights. Supports multiple formats including bullet points, executive summaries, and detailed outlines with section highlights.',
    whenToUse:
      'Use when you need to condense long documents, meeting notes, email threads, or code changes into digestible summaries for quick consumption.',
    workflow: [
      'Analyze the full content structure',
      'Identify key points and main themes',
      'Extract critical details and data points',
      'Generate concise summary with key takeaways',
      'Format for the target audience',
    ],
    plugins: ['read'],
    loaded: true,
    version: '1.3.0',
    author: 'OpenHarness Comms',
    icon: <MessageSquareQuote className="w-4 h-4" />,
  },
  {
    id: 'translate',
    name: 'translate',
    category: 'Communication',
    description:
      'Translate text between languages with context-aware translations preserving technical terms, tone, and cultural nuances.',
    fullDescription:
      'Provides high-quality translations between languages with awareness of context, technical terminology, and cultural nuances. Preserves formatting, code blocks, and technical terms. Supports both formal and informal registers.',
    whenToUse:
      'Use when you need to translate documentation, user-facing content, code comments, or any text between languages with accuracy and context preservation.',
    workflow: [
      'Detect source language and understand context',
      'Translate while preserving technical terms',
      'Adapt for target audience and cultural context',
      'Review and refine the translation quality',
    ],
    plugins: [],
    loaded: false,
    version: '1.2.0',
    author: 'OpenHarness Comms',
    icon: <Languages className="w-4 h-4" />,
  },
];

// ── Component ──────────────────────────────────────────────────

export default function SkillsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [skillStates, setSkillStates] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    allSkills.forEach((s) => {
      initial[s.id] = s.loaded;
    });
    return initial;
  });

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return allSkills;
    const q = searchQuery.toLowerCase();
    return allSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const totalSkills = allSkills.length;
  const loadedCount = Object.values(skillStates).filter(Boolean).length;

  const toggleSkill = (skillId: string) => {
    setSkillStates((prev) => ({ ...prev, [skillId]: !prev[skillId] }));
  };

  const openDetail = (skill: SkillItem) => {
    setSelectedSkill({ ...skill, loaded: skillStates[skill.id] });
    setSheetOpen(true);
  };

  const groupedSkills = useMemo(() => {
    const groups: Record<SkillCategory, SkillItem[]> = {
      Development: [],
      Document: [],
      Research: [],
      Communication: [],
    };
    filteredSkills.forEach((s) => groups[s.category].push(s));
    return groups;
  }, [filteredSkills]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10">
            <BookOpen className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Skills Manager</h1>
            <p className="text-sm text-muted-foreground">
              {totalSkills} Skills Available · {loadedCount} Loaded
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search skills..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button className="shrink-0">
            <Plus className="w-4 h-4" />
            Load Skill
          </Button>
        </div>
      </div>

      {/* Skills Grid */}
      <ScrollArea className="h-[calc(100vh-200px)]">
        <div className="pr-4 flex flex-col gap-8">
          {(Object.entries(groupedSkills) as [SkillCategory, SkillItem[]][]).map(
            ([category, skills]) =>
              skills.length > 0 && (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-2 h-2 rounded-full ${categoryConfig[category].bg.replace('/10', '/100')}`} />
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      {category} Skills
                    </h2>
                    <Badge variant="outline" className="text-[10px]">
                      {skills.length}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {skills.map((skill) => {
                      const config = categoryConfig[skill.category];
                      const isLoaded = skillStates[skill.id];
                      return (
                        <Card
                          key={skill.id}
                          className={`py-0 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.01] cursor-pointer border-l-4 ${config.border}`}
                          style={{ gap: 0 }}
                          onClick={() => openDetail(skill)}
                        >
                          <CardContent className="p-4 flex flex-col gap-3">
                            {/* Skill Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`flex items-center justify-center w-8 h-8 rounded-lg ${config.bg} ${config.color} shrink-0`}
                                >
                                  {skill.icon}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-sm flex items-center gap-1.5">
                                    {skill.name}
                                    <Sparkles
                                      className={`w-3 h-3 ${config.color} opacity-60`}
                                    />
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] mt-0.5 ${config.badge}`}
                                  >
                                    {skill.category}
                                  </Badge>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSkill(skill.id);
                                }}
                                className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors border ${
                                  isLoaded
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'
                                    : 'bg-white border-zinc-200 text-zinc-400 hover:bg-zinc-50'
                                }`}
                                title={isLoaded ? 'Unload skill' : 'Load skill'}
                              >
                                {isLoaded ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <Plus className="w-4 h-4" />
                                )}
                              </button>
                            </div>

                            {/* Description */}
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                              {skill.description}
                            </p>

                            {/* Footer */}
                            <div className="flex items-center justify-between pt-1">
                              <div className="flex items-center gap-1.5">
                                {isLoaded ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200 text-[10px]">
                                    <Zap className="w-3 h-3 mr-0.5" />
                                    Loaded
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                    Available
                                  </Badge>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )
          )}

          {filteredSkills.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Search className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                No skills found matching &ldquo;{searchQuery}&rdquo;
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Skill Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
          {selectedSkill && (
            <>
              <SheetHeader className="mb-6">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-xl ${categoryConfig[selectedSkill.category].bg} ${categoryConfig[selectedSkill.category].color}`}
                  >
                    {selectedSkill.icon}
                  </div>
                  <div>
                    <SheetTitle className="text-lg flex items-center gap-2">
                      {selectedSkill.name}
                      <Sparkles className={`w-4 h-4 ${categoryConfig[selectedSkill.category].color} opacity-60`} />
                    </SheetTitle>
                    <SheetDescription className="text-xs mt-1">
                      v{selectedSkill.version} · {selectedSkill.author}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex flex-col gap-6">
                {/* Category & Status */}
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`${categoryConfig[selectedSkill.category].badge}`}
                  >
                    {selectedSkill.category}
                  </Badge>
                  {skillStates[selectedSkill.id] ? (
                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">
                      <Zap className="w-3 h-3 mr-1" />
                      Loaded
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Available
                    </Badge>
                  )}
                </div>

                {/* Description */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Description</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {selectedSkill.fullDescription}
                  </p>
                </div>

                <Separator />

                {/* When to Use */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <FolderSync className="w-4 h-4 text-emerald-500" />
                    When to Use
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {selectedSkill.whenToUse}
                  </p>
                </div>

                <Separator />

                {/* Workflow */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-emerald-500" />
                    Workflow
                  </h3>
                  <ol className="flex flex-col gap-2">
                    {selectedSkill.workflow.map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-700 text-xs font-semibold shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <span className="text-sm text-muted-foreground leading-relaxed">
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>

                <Separator />

                {/* Compatible Plugins */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-500" />
                    Compatible Plugins
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSkill.plugins.length > 0 ? (
                      selectedSkill.plugins.map((plugin) => (
                        <Badge key={plugin} variant="outline" className="text-xs font-mono">
                          {plugin}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground italic">
                        No additional plugins required
                      </span>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Action Button */}
                <Button
                  className="w-full"
                  variant={skillStates[selectedSkill.id] ? 'outline' : 'default'}
                  onClick={() => {
                    toggleSkill(selectedSkill.id);
                    setSelectedSkill({ ...selectedSkill, loaded: !skillStates[selectedSkill.id] });
                  }}
                >
                  {skillStates[selectedSkill.id] ? (
                    <>
                      <X className="w-4 h-4" />
                      Unload Skill
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Load Skill
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
