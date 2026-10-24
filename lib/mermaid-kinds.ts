import {
  ArrowLeftRight,
  Binary,
  Boxes,
  ChartGantt,
  ChartLine,
  ChartPie,
  CircleDot,
  Database,
  GitBranch,
  Grid2x2,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Milestone,
  Network,
  Radar,
  Route,
  Server,
  Shapes,
  SquareKanban,
  Waves,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export interface MermaidKind {
  id: string;
  label: string;
  icon: LucideIcon;
}

const kinds: [RegExp, MermaidKind][] = [
  [/^(?:flowchart|graph)\b/, { id: 'flowchart', label: '流程图', icon: Workflow }],
  [/^sequenceDiagram\b/, { id: 'sequence', label: '时序图', icon: ArrowLeftRight }],
  [/^classDiagram/, { id: 'class', label: '类图', icon: Boxes }],
  [/^stateDiagram/, { id: 'state', label: '状态图', icon: CircleDot }],
  [/^erDiagram\b/, { id: 'er', label: '实体关系图', icon: Database }],
  [/^gantt\b/, { id: 'gantt', label: '甘特图', icon: ChartGantt }],
  [/^pie\b/, { id: 'pie', label: '饼图', icon: ChartPie }],
  [/^journey\b/, { id: 'journey', label: '用户旅程图', icon: Route }],
  [/^gitGraph\b/, { id: 'git', label: 'Git 分支图', icon: GitBranch }],
  [/^mindmap\b/, { id: 'mindmap', label: '思维导图', icon: Network }],
  [/^timeline\b/, { id: 'timeline', label: '时间线', icon: Milestone }],
  [/^quadrantChart\b/, { id: 'quadrant', label: '象限图', icon: Grid2x2 }],
  [/^xychart/, { id: 'xychart', label: 'XY 图', icon: ChartLine }],
  [/^sankey/, { id: 'sankey', label: '桑基图', icon: Waves }],
  [/^block/, { id: 'block', label: '块图', icon: LayoutGrid }],
  [/^packet/, { id: 'packet', label: '数据包图', icon: Binary }],
  [/^architecture/, { id: 'architecture', label: '架构图', icon: Server }],
  [/^kanban\b/, { id: 'kanban', label: '看板', icon: SquareKanban }],
  [/^requirementDiagram\b/, { id: 'requirement', label: '需求图', icon: ListChecks }],
  [/^radar/, { id: 'radar', label: '雷达图', icon: Radar }],
  [/^treemap/, { id: 'treemap', label: '矩形树图', icon: LayoutDashboard }],
  [/^C4/, { id: 'c4', label: 'C4 架构图', icon: Layers }],
];

const fallback: MermaidKind = { id: 'diagram', label: '图表', icon: Shapes };

/** The diagram type of a Mermaid source, read from its first statement. */
export function describeMermaidChart(source: string): MermaidKind {
  // Skip YAML frontmatter, `%%` comments/directives and blank lines.
  const body = source.replace(/^\s*---\n[\s\S]*?\n---\s*\n/, '');
  const first = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('%%'));
  if (!first) return fallback;
  return kinds.find(([pattern]) => pattern.test(first))?.[1] ?? fallback;
}
