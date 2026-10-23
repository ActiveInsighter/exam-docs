import type { MermaidConfig } from 'mermaid';

export const mermaidPresets = [
  { id: 'classic', name: 'Classic · 当前基线', description: '现有的浅紫配色与传统线框，用来对照。' },
  { id: 'neo', name: 'Neo · 柔和现代', description: '更柔和的节点、圆角与线条，适合日常文档。' },
  { id: 'redux', name: 'Redux · 简洁单色', description: '减少颜色干扰，让结构和文字成为重点。' },
  { id: 'redux-color', name: 'Redux Color · 彩色分类', description: '用不同颜色区分对象，适合讲解角色和关系。' },
  { id: 'hand-drawn', name: 'Hand Drawn · 手绘笔记', description: '保留草图的笔触，适合课堂笔记和思路梳理。' },
  { id: 'teal', name: '青绿 · 自定义主题', description: '低饱和青绿节点与清晰的深色文字。' },
  { id: 'indigo', name: '靛蓝 · 自定义主题', description: '偏冷的蓝色调，适合技术说明与系统关系。' },
] as const;

export type MermaidPreset = (typeof mermaidPresets)[number]['id'];

export function getMermaidPreset(preset: MermaidPreset, dark: boolean): MermaidConfig {
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
