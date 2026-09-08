import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(
  resolve(process.cwd(), 'components/exam-question.module.css'),
  'utf8',
);
const solutionDialogSource = readFileSync(
  resolve(process.cwd(), 'components/exam-solution-dialog.tsx'),
  'utf8',
);

function getRule(name: string) {
  const match = stylesheet.match(
    new RegExp(`\\.${name}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );

  if (!match) throw new Error(`Missing .${name} rule`);
  return match[1];
}

describe('exam answer preview styling', () => {
  it('sizes the preview from its content', () => {
    const previewRule = getRule('answerPreview');

    expect(previewRule).toMatch(/width:\s*max-content/);
  });

  it('does not render an answer label in the hover preview', () => {
    const previewSource = solutionDialogSource.match(
      /<div id=\{answerId\} role="tooltip"[\s\S]*?<\/div>\s*\) : null/,
    )?.[0];

    expect(previewSource).toBeDefined();
    expect(previewSource).not.toContain('answerPreviewLabel');
    expect(previewSource).not.toContain('>答案</');
  });

  it('uses each overlay pane surface as its scrollbar track background', () => {
    const paneRule = getRule('pane');

    expect(paneRule).toMatch(
      /scrollbar-color:\s*color-mix\(\s*in oklch,\s*var\(--foreground\) 24%,\s*var\(--pane-background\)\s*\)\s+var\(--pane-background\)/,
    );
    expect(stylesheet).toMatch(
      /\.pane::\-webkit-scrollbar-track\s*,[\s\S]*?\{\s*background:\s*var\(--pane-background\)/,
    );
  });

  it('keeps dialog motion on composited properties without backdrop blur', () => {
    const dialogRule = getRule('dialog');
    const backdropEnterRule = stylesheet.match(
      /@keyframes backdrop-enter\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(dialogRule).toMatch(/transform:/);
    expect(dialogRule).toMatch(/opacity:/);
    expect(backdropEnterRule).toBeDefined();
    expect(backdropEnterRule).toMatch(/background:/);
    expect(backdropEnterRule).not.toMatch(/backdrop-filter:/);
  });

  it('lets the dialog question pane recalculate nested choice columns', () => {
    const questionPaneRule = getRule('questionPane');

    expect(questionPaneRule).toMatch(/container-type:\s*inline-size/);
  });

  it('uses a full-width dotted divider without underlining the trigger text', () => {
    const actionsRule = getRule('actions');
    const triggerRule = getRule('trigger');

    expect(actionsRule).toMatch(/border-block-end:\s*0/);
    expect(actionsRule).toMatch(/background-image:\s*radial-gradient\(\s*circle/);
    expect(actionsRule).toMatch(/background-repeat:\s*repeat-x/);
    expect(actionsRule).toMatch(/background-size:\s*0\.5rem 0\.125rem/);
    expect(actionsRule).toMatch(
      /color-mix\(in oklch, var\(--muted-foreground\) 42%, var\(--background\)\)/,
    );
    expect(triggerRule).not.toMatch(/text-decoration-/);
    expect(solutionDialogSource).not.toContain('styles.triggerIcon');
  });

  it('slightly increases the choice option line spacing', () => {
    const choiceOptionsRule = getRule('choiceOptions');

    expect(choiceOptionsRule).toMatch(/line-height:\s*1\.6/);
  });
});
