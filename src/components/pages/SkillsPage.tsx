'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
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
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';

// ── Types ──────────────────────────────────────────────────────

interface SkillFromAPI {
  id: string;
  name: string;
  description: string | null;
  content: string;
  category: string;
  isLoaded: boolean;
  createdAt: string;
}

interface SkillItem {
  id: string;
  name: string;
  category: string;
  description: string;
  content: string;
  isLoaded: boolean;
  icon: React.ReactNode;
}

type SkillCategory = 'Development' | 'Research' | 'Communication' | 'Document' | 'General';

// ── Category Config ────────────────────────────────────────────

const categoryConfig: Record<
  string,
  { color: string; bg: string; border: string; badge: string; dotColor: string }
> = {
  development: {
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
    border: 'border-l-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotColor: 'bg-emerald-500',
  },
  document: {
    color: 'text-amber-600',
    bg: 'bg-amber-500/10',
    border: 'border-l-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dotColor: 'bg-amber-500',
  },
  research: {
    color: 'text-sky-600',
    bg: 'bg-sky-500/10',
    border: 'border-l-sky-500',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    dotColor: 'bg-sky-500',
  },
  communication: {
    color: 'text-violet-600',
    bg: 'bg-violet-500/10',
    border: 'border-l-violet-500',
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    dotColor: 'bg-violet-500',
  },
  general: {
    color: 'text-zinc-600',
    bg: 'bg-zinc-500/10',
    border: 'border-l-zinc-500',
    badge: 'bg-zinc-50 text-zinc-700 border-zinc-200',
    dotColor: 'bg-zinc-500',
  },
};

const CATEGORY_DISPLAY: Record<string, string> = {
  development: 'Development',
  document: 'Document',
  research: 'Research',
  communication: 'Communication',
  general: 'General',
};

// ── Icon Mapping ───────────────────────────────────────────────

const SKILL_ICONS: Record<string, React.ReactNode> = {
  commit: <GitCommitHorizontal className="w-4 h-4" />,
  review: <Eye className="w-4 h-4" />,
  debug: <Bug className="w-4 h-4" />,
  plan: <Map className="w-4 h-4" />,
  test: <TestTube2 className="w-4 h-4" />,
  simplify: <Minimize2 className="w-4 h-4" />,
  pdf: <FileText className="w-4 h-4" />,
  xlsx: <Table2 className="w-4 h-4" />,
  docx: <FilePenLine className="w-4 h-4" />,
  pptx: <Presentation className="w-4 h-4" />,
  'web-search': <Globe className="w-4 h-4" />,
  'web-reader': <BookOpenCheck className="w-4 h-4" />,
  research: <Microscope className="w-4 h-4" />,
  summarize: <MessageSquareQuote className="w-4 h-4" />,
  translate: <Languages className="w-4 h-4" />,
};

function getSkillIcon(name: string): React.ReactNode {
  return SKILL_ICONS[name.toLowerCase()] || <BookOpen className="w-4 h-4" />;
}

// ── Loading Skeleton ───────────────────────────────────────────

function SkillCardSkeleton() {
  return (
    <Card className="py-0 shadow-sm border-l-4 border-l-zinc-200" style={{ gap: 0 }}>
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <div className="flex flex-col gap-1">
              <Skeleton className="w-20 h-4 rounded" />
              <Skeleton className="w-16 h-4 rounded" />
            </div>
          </div>
          <Skeleton className="w-8 h-8 rounded-lg" />
        </div>
        <Skeleton className="w-full h-3 rounded" />
        <Skeleton className="w-full h-3 rounded" />
        <Skeleton className="w-2/3 h-3 rounded" />
        <div className="flex items-center justify-between">
          <Skeleton className="w-16 h-5 rounded-full" />
          <Skeleton className="w-4 h-4 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function mapApiSkillToItem(skill: SkillFromAPI): SkillItem {
  return {
    id: skill.id,
    name: skill.name,
    category: skill.category,
    description: skill.description || 'No description available.',
    content: skill.content,
    isLoaded: skill.isLoaded,
    icon: getSkillIcon(skill.name),
  };
}

function getCategoryLabel(cat: string): string {
  return CATEGORY_DISPLAY[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
}

// ── Component ──────────────────────────────────────────────────

export default function SkillsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [skills, setSkills] = useState<SkillFromAPI[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  // Fetch skills from API
  const fetchSkills = useCallback(async (category?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category && category !== 'All') {
        params.set('category', category);
      }
      const res = await fetch(`/api/skills${params.toString() ? `?${params.toString()}` : ''}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSkills(json.data);
      } else {
        setError(json.error || 'Failed to load skills');
        setSkills([]);
      }
    } catch {
      setError('Network error. Please try again.');
      setSkills([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  // Map API skills to UI items
  const allSkillItems = useMemo(() => skills.map(mapApiSkillToItem), [skills]);

  // Client-side search
  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return allSkillItems;
    const q = searchQuery.toLowerCase();
    return allSkillItems.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [allSkillItems, searchQuery]);

  // Group skills by category
  const groupedSkills = useMemo(() => {
    const groups: Record<string, SkillItem[]> = {};
    filteredSkills.forEach((s) => {
      const key = s.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  }, [filteredSkills]);

  const totalSkills = skills.length;
  const loadedCount = skills.filter((s) => s.isLoaded).length;

  // Available category filters
  const availableCategories = useMemo(() => {
    const cats = new Set(skills.map((s) => s.category));
    return Array.from(cats).sort();
  }, [skills]);

  // Category filter handler
  const handleCategoryFilter = (cat: string) => {
    fetchSkills(cat === 'All' ? undefined : cat);
  };

  // Toggle skill loaded state with optimistic UI
  const toggleSkill = async (skillId: string, currentState: boolean) => {
    const newState = !currentState;

    // Optimistic update
    setSkills((prev) =>
      prev.map((s) => (s.id === skillId ? { ...s, isLoaded: newState } : s))
    );
    setTogglingIds((prev) => new Set(prev).add(skillId));

    // Update selected skill in sheet if open
    if (selectedSkill?.id === skillId) {
      setSelectedSkill((prev) => prev ? { ...prev, isLoaded: newState } : prev);
    }

    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: skillId, isLoaded: newState }),
      });
      const json = await res.json();

      if (!json.success) {
        // Revert on failure
        setSkills((prev) =>
          prev.map((s) => (s.id === skillId ? { ...s, isLoaded: currentState } : s))
        );
        if (selectedSkill?.id === skillId) {
          setSelectedSkill((prev) => prev ? { ...prev, isLoaded: currentState } : prev);
        }
        toast({
          title: 'Failed to update skill',
          description: json.error || 'An error occurred while updating the skill.',
          variant: 'destructive',
        });
      } else {
        const skillName = skills.find((s) => s.id === skillId)?.name || 'Skill';
        toast({
          title: `Skill ${newState ? 'loaded' : 'unloaded'}`,
          description: `${skillName} has been ${newState ? 'loaded' : 'unloaded'}.`,
        });
      }
    } catch {
      // Revert on network error
      setSkills((prev) =>
        prev.map((s) => (s.id === skillId ? { ...s, isLoaded: currentState } : s))
      );
      if (selectedSkill?.id === skillId) {
        setSelectedSkill((prev) => prev ? { ...prev, isLoaded: currentState } : prev);
      }
      toast({
        title: 'Network error',
        description: 'Could not reach the server. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(skillId);
        return next;
      });
    }
  };

  const openDetail = (skill: SkillItem) => {
    setSelectedSkill(skill);
    setSheetOpen(true);
  };

  // Parse content into structured sections for display
  const parseSkillContent = (content: string) => {
    const lines = content.split('\n').filter((l) => l.trim());
    const sections: { heading: string; items: string[] }[] = [];
    let currentSection: { heading: string; items: string[] } | null = null;

    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (currentSection) sections.push(currentSection);
        currentSection = { heading: line.replace('## ', '').trim(), items: [] };
      } else if (line.startsWith('# ')) {
        if (currentSection) sections.push(currentSection);
        currentSection = { heading: line.replace('# ', '').trim(), items: [] };
      } else if (currentSection) {
        const cleaned = line
          .replace(/^[-*]\s+/, '')
          .replace(/^\d+\.\s+/, '')
          .replace(/^```\w*$/, '')
          .trim();
        if (cleaned) {
          currentSection.items.push(cleaned);
        }
      }
    }
    if (currentSection) sections.push(currentSection);
    return sections;
  };

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
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => handleCategoryFilter('All')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border bg-white text-muted-foreground border-zinc-200 hover:border-emerald-400 hover:text-foreground"
        >
          All
          <span className="text-xs opacity-70">({totalSkills})</span>
        </button>
        {availableCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategoryFilter(cat)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border bg-white text-muted-foreground border-zinc-200 hover:border-emerald-400 hover:text-foreground"
          >
            {getCategoryLabel(cat)}
            <span className="text-xs opacity-70">
              ({skills.filter((s) => s.category === cat).length})
            </span>
          </button>
        ))}
      </div>

      {/* Skills Grid */}
      <ScrollArea className="h-[calc(100vh-240px)]">
        <div className="pr-4 flex flex-col gap-8">
          {isLoading ? (
            <div className="flex flex-col gap-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-4">
                    <Skeleton className="w-2 h-2 rounded-full" />
                    <Skeleton className="w-32 h-4 rounded" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <SkillCardSkeleton key={j} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <AlertTriangle className="w-10 h-10 text-amber-500" />
              <p className="text-sm font-medium text-foreground">Unable to load skills</p>
              <p className="text-sm text-muted-foreground max-w-md text-center">{error}</p>
              <button
                onClick={() => fetchSkills()}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                <Loader2 className="w-3.5 h-3.5" />
                Retry
              </button>
            </div>
          ) : (
            Object.entries(groupedSkills).map(([category, categorySkills]) => {
              const config = categoryConfig[category] || categoryConfig.general;
              return (
                <div key={category}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className={`w-2 h-2 rounded-full ${config.dotColor}`} />
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      {getCategoryLabel(category)} Skills
                    </h2>
                    <Badge variant="outline" className="text-[10px]">
                      {categorySkills.length}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {categorySkills.map((skill) => {
                      const isToggling = togglingIds.has(skill.id);
                      const currentLoaded = skill.isLoaded;
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
                                    {getCategoryLabel(skill.category)}
                                  </Badge>
                                </div>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSkill(skill.id, currentLoaded);
                                }}
                                disabled={isToggling}
                                className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors border ${
                                  currentLoaded
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100'
                                    : 'bg-white border-zinc-200 text-zinc-400 hover:bg-zinc-50'
                                }`}
                                title={currentLoaded ? 'Unload skill' : 'Load skill'}
                              >
                                {isToggling ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : currentLoaded ? (
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
                                {currentLoaded ? (
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
              );
            })
          )}

          {!isLoading && !error && filteredSkills.length === 0 && (
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
                    className={`flex items-center justify-center w-10 h-10 rounded-xl ${categoryConfig[selectedSkill.category]?.bg || categoryConfig.general.bg} ${categoryConfig[selectedSkill.category]?.color || categoryConfig.general.color}`}
                  >
                    {selectedSkill.icon}
                  </div>
                  <div>
                    <SheetTitle className="text-lg flex items-center gap-2">
                      {selectedSkill.name}
                      <Sparkles className={`w-4 h-4 ${categoryConfig[selectedSkill.category]?.color || categoryConfig.general.color} opacity-60`} />
                    </SheetTitle>
                    <SheetDescription className="text-xs mt-1">
                      {getCategoryLabel(selectedSkill.category)}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex flex-col gap-6">
                {/* Category & Status */}
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={categoryConfig[selectedSkill.category]?.badge || categoryConfig.general.badge}
                  >
                    {getCategoryLabel(selectedSkill.category)}
                  </Badge>
                  {selectedSkill.isLoaded ? (
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
                    {selectedSkill.description}
                  </p>
                </div>

                <Separator />

                {/* Skill Content */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-emerald-500" />
                    Skill Content
                  </h3>
                  {(() => {
                    const sections = parseSkillContent(selectedSkill.content);
                    if (sections.length === 0) {
                      return (
                        <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                          {selectedSkill.content}
                        </div>
                      );
                    }
                    return (
                      <div className="flex flex-col gap-4">
                        {sections.map((section, idx) => (
                          <div key={idx}>
                            <h4 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">
                              {section.heading}
                            </h4>
                            {section.items.length > 0 ? (
                              <ol className="flex flex-col gap-1.5">
                                {section.items.map((item, i) => (
                                  <li key={i} className="flex items-start gap-3">
                                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-700 text-[10px] font-semibold shrink-0 mt-0.5">
                                      {i + 1}
                                    </span>
                                    <span className="text-sm text-muted-foreground leading-relaxed">
                                      {item}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">
                                No details available.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <Separator />

                {/* Action Button */}
                <Button
                  className="w-full"
                  variant={selectedSkill.isLoaded ? 'outline' : 'default'}
                  disabled={togglingIds.has(selectedSkill.id)}
                  onClick={() => {
                    toggleSkill(selectedSkill.id, selectedSkill.isLoaded);
                  }}
                >
                  {togglingIds.has(selectedSkill.id) ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Updating...
                    </>
                  ) : selectedSkill.isLoaded ? (
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
