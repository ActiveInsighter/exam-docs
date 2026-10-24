import type { MermaidConfig } from 'mermaid';

export const mermaidPresets = [
  { id: 'modern', name: 'Modern · 站点默认', description: '中性底色、细边框与一抹蓝色强调，和站点界面保持一致。' },
  { id: 'classic', name: 'Classic · 旧版默认', description: 'Mermaid 传统的浅紫配色与线框，用来对照。' },
  { id: 'neo', name: 'Neo · 柔和现代', description: '更柔和的节点、圆角与线条，适合日常文档。' },
  { id: 'redux', name: 'Redux · 简洁单色', description: '减少颜色干扰，让结构和文字成为重点。' },
  { id: 'redux-color', name: 'Redux Color · 彩色分类', description: '用不同颜色区分对象，适合讲解角色和关系。' },
  { id: 'hand-drawn', name: 'Hand Drawn · 手绘笔记', description: '保留草图的笔触，适合课堂笔记和思路梳理。' },
  { id: 'teal', name: '青绿 · 自定义主题', description: '低饱和青绿节点与清晰的深色文字。' },
  { id: 'indigo', name: '靛蓝 · 自定义主题', description: '偏冷的蓝色调，适合技术说明与系统关系。' },
] as const;

export type MermaidPreset = (typeof mermaidPresets)[number]['id'];

export const defaultMermaidPreset: MermaidPreset = 'modern';

// `--font-inter` exists only where next/font loads Inter; its fallback keeps a
// downloaded SVG readable outside the site.
const fontFamily =
  'var(--font-inter, Inter), "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

/**
 * Site default. Mermaid derives many colours from these with khroma, so every
 * value must be a literal colour (no CSS variables). Neutral surfaces follow
 * Fumadocs' black theme; one blue accent marks secondary shapes.
 */
const modernPalette = {
  light: {
    canvas: '#fcfcfc',
    node: '#ffffff',
    nodeBorder: '#d4d4d8',
    text: '#18181b',
    muted: '#52525b',
    line: '#a1a1aa',
    accent: '#2563eb',
    accentSoft: '#eff4ff',
    accentBorder: '#bfd3fe',
    group: '#f4f4f5',
    groupBorder: '#e4e4e7',
    note: '#fffbeb',
    noteBorder: '#f5d27a',
    categorical: ['#dbe7ff', '#d5f5ec', '#ede4ff', '#ffe9cf', '#ffe0e6', '#e0f2fe', '#ecfccb', '#f4f4f5'],
    categoricalStrong: ['#3b82f6', '#14b8a6', '#8b5cf6', '#f59e0b', '#f43f5e', '#0ea5e9', '#84cc16', '#71717a'],
  },
  dark: {
    canvas: '#0b0b0c',
    node: '#18181b',
    nodeBorder: '#3f3f46',
    text: '#f4f4f5',
    muted: '#a1a1aa',
    line: '#71717a',
    accent: '#60a5fa',
    accentSoft: '#172036',
    accentBorder: '#2f4a7d',
    group: '#131316',
    groupBorder: '#27272a',
    note: '#2a2414',
    noteBorder: '#6b5a24',
    categorical: ['#1d2b4a', '#123a33', '#2a2148', '#3a2a12', '#3d1c26', '#0f3047', '#26330f', '#27272a'],
    categoricalStrong: ['#60a5fa', '#2dd4bf', '#a78bfa', '#fbbf24', '#fb7185', '#38bdf8', '#a3e635', '#a1a1aa'],
  },
} as const;

function getModernConfig(dark: boolean): MermaidConfig {
  const c = dark ? modernPalette.dark : modernPalette.light;
  const scale = Object.fromEntries(
    c.categorical.flatMap((color, i) => [
      [`cScale${i}`, color],
      [`cScaleLabel${i}`, c.text],
      [`cScalePeer${i}`, c.categoricalStrong[i]],
    ]),
  );
  const pie = Object.fromEntries(c.categoricalStrong.map((color, i) => [`pie${i + 1}`, color]));
  const git = Object.fromEntries(
    c.categoricalStrong.flatMap((color, i) => [
      [`git${i}`, color],
      [`gitBranchLabel${i}`, dark ? '#0b0b0c' : '#ffffff'],
    ]),
  );

  return {
    startOnLoad: false,
    securityLevel: 'loose',
    layout: 'dagre',
    look: 'neo',
    theme: 'base',
    fontFamily,
    flowchart: { curve: 'basis', nodeSpacing: 40, rankSpacing: 48, padding: 14 },
    sequence: { actorMargin: 56, boxMargin: 12, noteMargin: 12, messageMargin: 40, mirrorActors: false },
    // Gantt otherwise sizes itself to the off-screen render container (often 1200px+).
    gantt: { useWidth: 760, barHeight: 24, barGap: 6, topPadding: 44, sectionFontSize: 13, fontSize: 13 },
    gitGraph: { rotateCommitLabel: false },
    xyChart: { width: 640, height: 360 },
    quadrantChart: { chartWidth: 440, chartHeight: 440 },
    // Mermaid scopes this to the diagram's own id.
    themeCSS: [
      '.node rect.basic.label-container { rx: 8px; ry: 8px; }',
      '.cluster rect { rx: 12px; ry: 12px; }',
      '.edgeLabel, .edgeLabel p { font-size: 13px; }',
      '.actor { rx: 8px; ry: 8px; }',
      '.note { rx: 6px; ry: 6px; }',
      '.labelBox { rx: 4px; ry: 4px; }',
    ].join('\n'),
    themeVariables: {
      darkMode: dark,
      fontFamily,
      fontSize: '14px',
      background: c.canvas,
      primaryColor: c.node,
      primaryTextColor: c.text,
      primaryBorderColor: c.nodeBorder,
      secondaryColor: c.accentSoft,
      secondaryTextColor: c.text,
      secondaryBorderColor: c.accentBorder,
      tertiaryColor: c.group,
      tertiaryTextColor: c.text,
      tertiaryBorderColor: c.groupBorder,
      mainBkg: c.node,
      nodeBorder: c.nodeBorder,
      nodeTextColor: c.text,
      textColor: c.text,
      titleColor: c.text,
      lineColor: c.line,
      defaultLinkColor: c.line,
      edgeLabelBackground: c.canvas,
      clusterBkg: c.group,
      clusterBorder: c.groupBorder,
      useGradient: false,
      dropShadow: 'none',
      // Sequence
      actorBkg: c.node,
      actorBorder: c.nodeBorder,
      actorTextColor: c.text,
      actorLineColor: c.groupBorder,
      signalColor: c.muted,
      signalTextColor: c.text,
      labelBoxBkgColor: c.accentSoft,
      labelBoxBorderColor: c.accentBorder,
      labelTextColor: c.text,
      loopTextColor: c.muted,
      activationBkgColor: c.accentSoft,
      activationBorderColor: c.accent,
      sequenceNumberColor: dark ? '#0b0b0c' : '#ffffff',
      noteBkgColor: c.note,
      noteTextColor: c.text,
      noteBorderColor: c.noteBorder,
      // State and class
      labelColor: c.text,
      stateTextColor: c.text,
      stateLabelColor: c.text,
      altBackground: c.group,
      compositeBackground: c.group,
      compositeTitleBackground: c.group,
      stateBkg: c.node,
      stateBorder: c.nodeBorder,
      transitionColor: c.line,
      specialStateColor: c.muted,
      innerEndBackground: c.muted,
      classText: c.text,
      // ER
      attributeBackgroundColorOdd: c.node,
      attributeBackgroundColorEven: c.group,
      // Gantt
      sectionBkgColor: c.group,
      altSectionBkgColor: c.canvas,
      sectionBkgColor2: c.group,
      taskBkgColor: c.accentSoft,
      taskBorderColor: c.accent,
      taskTextColor: c.text,
      taskTextLightColor: c.text,
      taskTextOutsideColor: c.text,
      taskTextDarkColor: c.text,
      activeTaskBkgColor: c.accent,
      activeTaskBorderColor: c.accent,
      doneTaskBkgColor: c.groupBorder,
      doneTaskBorderColor: c.line,
      critBkgColor: dark ? '#3d1c26' : '#ffe0e6',
      critBorderColor: dark ? '#fb7185' : '#f43f5e',
      gridColor: c.groupBorder,
      todayLineColor: dark ? '#fb7185' : '#f43f5e',
      // Pie
      pieStrokeColor: c.canvas,
      pieStrokeWidth: '2px',
      pieOuterStrokeColor: c.canvas,
      pieOuterStrokeWidth: '0px',
      pieTitleTextColor: c.text,
      pieSectionTextColor: dark ? '#0b0b0c' : '#ffffff',
      pieLegendTextColor: c.text,
      pieOpacity: '1',
      // Quadrant
      quadrant1Fill: c.accentSoft,
      quadrant2Fill: c.group,
      quadrant3Fill: c.canvas,
      quadrant4Fill: c.group,
      quadrant1TextFill: c.text,
      quadrant2TextFill: c.text,
      quadrant3TextFill: c.text,
      quadrant4TextFill: c.text,
      quadrantPointFill: c.accent,
      quadrantPointTextFill: c.text,
      quadrantXAxisTextFill: c.muted,
      quadrantYAxisTextFill: c.muted,
      quadrantInternalBorderStrokeFill: c.groupBorder,
      quadrantExternalBorderStrokeFill: c.nodeBorder,
      quadrantTitleFill: c.text,
      ...scale,
      ...pie,
      ...git,
      xyChart: {
        backgroundColor: c.canvas,
        titleColor: c.text,
        xAxisLabelColor: c.muted,
        xAxisTitleColor: c.muted,
        xAxisTickColor: c.line,
        xAxisLineColor: c.line,
        yAxisLabelColor: c.muted,
        yAxisTitleColor: c.muted,
        yAxisTickColor: c.line,
        yAxisLineColor: c.line,
        plotColorPalette: c.categoricalStrong.join(','),
      },
      radar: {
        curveOpacity: 0.28,
        graticuleColor: c.groupBorder,
        axisColor: c.line,
      },
    },
  };
}

/** Mermaid config for `preset` (the site default when omitted) in the given colour scheme. */
export function getMermaidPreset(preset: MermaidPreset = defaultMermaidPreset, dark: boolean): MermaidConfig {
  if (preset === 'modern') return getModernConfig(dark);

  const config: MermaidConfig = {
    startOnLoad: false,
    securityLevel: 'loose',
    layout: 'dagre',
    look: 'neo',
    fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  };

  if (preset === 'classic') {
    return { ...config, look: 'classic', fontFamily: 'inherit', theme: dark ? 'dark' : 'default' };
  }
  if (preset === 'neo' || preset === 'hand-drawn') {
    return {
      ...config,
      theme: dark ? 'neo-dark' : 'neo',
      look: preset === 'hand-drawn' ? 'handDrawn' : 'neo',
      handDrawnSeed: 42,
    };
  }
  if (preset === 'redux' || preset === 'redux-color') {
    return {
      ...config,
      theme: preset === 'redux'
        ? (dark ? 'redux-dark' : 'redux')
        : (dark ? 'redux-dark-color' : 'redux-color'),
    };
  }

  const teal = preset === 'teal';
  const foreground = dark ? '#e2e8f0' : '#0f172a';
  const accent = teal ? (dark ? '#5eead4' : '#0d9488') : (dark ? '#a5b4fc' : '#6366f1');
  const surface = teal ? (dark ? '#123832' : '#ecfdf5') : (dark ? '#242c50' : '#eef2ff');
  return {
    ...config,
    theme: 'base',
    flowchart: { curve: 'basis', nodeSpacing: 36, rankSpacing: 44 },
    themeVariables: {
      darkMode: dark,
      background: dark ? '#111827' : '#ffffff',
      primaryColor: surface,
      primaryTextColor: foreground,
      primaryBorderColor: accent,
      secondaryColor: dark ? '#1e293b' : '#f1f5f9',
      secondaryTextColor: foreground,
      tertiaryColor: dark ? '#172033' : '#f8fafc',
      tertiaryTextColor: foreground,
      lineColor: dark ? '#94a3b8' : '#64748b',
      textColor: foreground,
      nodeBorder: accent,
      useGradient: false,
      edgeLabelBackground: dark ? '#111827' : '#ffffff',
      actorBkg: surface,
      actorBorder: accent,
      actorTextColor: foreground,
      actorLineColor: dark ? '#94a3b8' : '#64748b',
      signalColor: foreground,
      signalTextColor: foreground,
      noteBkgColor: dark ? '#1e293b' : '#f1f5f9',
      noteTextColor: foreground,
      noteBorderColor: accent,
      fontSize: '15px',
    },
  };
}
