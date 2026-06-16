import Anthropic from '@anthropic-ai/sdk';

/**
 * Section priority order for context compression.
 * Lower index = higher priority = kept first.
 */
const SECTION_PRIORITY = [
  "What we're building",     // 1 — always kept, max 3 sentences
  'Tech stack',              // 2 — always kept
  'Git context',             // 3 — always kept
  "What's in progress",      // 4 — always kept
  "What's next",             // 5 — always kept
  'Conventions',             // 6 — truncated if needed
  'File structure',          // 7 — collapsed to top level only
  "What's working",          // 8 — dropped if token pressure
  'Checkpoints',             // 9 — always dropped
];

export type InjectIntent = 'continue' | 'newTask' | 'debug';

/**
 * Compress PROJECT.md to under 1800 tokens using Claude Haiku.
 */
export async function compressContext(
  projectMd: string,
  apiKey: string,
  intent?: InjectIntent
): Promise<string> {
  const client = new Anthropic({ apiKey });

  let systemPrompt = `You are a context compressor. Given a PROJECT.md file, compress it to under 1800 tokens while preserving the most important information.`;

  if (intent) {
    systemPrompt += `\n\nOptimize the compression for the following developer intent: "${intent}". Keep the focus on the sections priority listed in the user's intent.`;
  }

  systemPrompt += `\n\nOutput ONLY the compressed context, no explanations or meta-commentary.`;

  const response = await client.messages.create({
    model: 'claude-3-haiku-20240307',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Compress this PROJECT.md:\n\n${projectMd}`,
      },
    ],
  });

  const block = response.content[0];
  if (block.type === 'text') {
    return block.text;
  }

  // Fallback if response isn't text
  return truncateContext(projectMd);
}

/**
 * Parse PROJECT.md into sections by ## headings.
 */
function parseSections(
  projectMd: string
): { heading: string; content: string }[] {
  const lines = projectMd.split('\n');
  const sections: { heading: string; content: string }[] = [];
  let currentHeading = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)/);
    if (headingMatch) {
      if (currentHeading || currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentLines.join('\n').trim(),
        });
      }
      currentHeading = headingMatch[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Push final section
  if (currentHeading || currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentLines.join('\n').trim(),
    });
  }

  return sections;
}

/**
 * Fallback naive truncation respecting section priority.
 * Used when no API key is available.
 */
export function truncateContext(projectMd: string): string {
  const sections = parseSections(projectMd);
  const TOKEN_LIMIT = 2000;
  // Rough approximation: 1 token ≈ 4 chars
  const CHAR_LIMIT = TOKEN_LIMIT * 4;

  const result: string[] = [];
  let charCount = 0;

  // First pass: add sections in priority order
  for (const priorityName of SECTION_PRIORITY) {
    const section = sections.find(
      (s) => s.heading.toLowerCase() === priorityName.toLowerCase()
    );
    if (!section || !section.content) continue;

    // Always drop checkpoints
    if (priorityName === 'Checkpoints') continue;

    let sectionText = `## ${section.heading}\n\n${section.content}`;

    // Drop "What's working" if we're over 75% of limit
    if (
      priorityName === "What's working" &&
      charCount > CHAR_LIMIT * 0.75
    ) {
      continue;
    }

    // Collapse file structure to top level
    if (priorityName === 'File structure') {
      const lines = section.content.split('\n');
      const topLevel = lines.filter(
        (l) => !l.startsWith('    ') && !l.startsWith('\t\t')
      );
      sectionText = `## ${section.heading}\n\n${topLevel.join('\n')}`;
    }

    // Truncate conventions if over budget
    if (priorityName === 'Conventions' && charCount + sectionText.length > CHAR_LIMIT) {
      const remaining = Math.max(0, CHAR_LIMIT - charCount - 50);
      sectionText = sectionText.slice(0, remaining) + '\n...(truncated)';
    }

    if (charCount + sectionText.length > CHAR_LIMIT) continue;

    result.push(sectionText);
    charCount += sectionText.length;
  }

  // Second pass: add custom user-defined sections that are not in SECTION_PRIORITY
  for (const section of sections) {
    if (section.heading === '') continue; // preamble handled separately
    const isPredefined = SECTION_PRIORITY.some(
      (p) => p.toLowerCase() === section.heading.toLowerCase()
    );
    if (isPredefined) continue;

    const sectionText = `## ${section.heading}\n\n${section.content}`;
    if (charCount + sectionText.length < CHAR_LIMIT) {
      result.push(sectionText);
      charCount += sectionText.length;
    }
  }

  // Add any preamble (content before first ## heading)
  const preamble = sections.find((s) => s.heading === '');
  if (preamble && preamble.content && charCount + preamble.content.length < CHAR_LIMIT) {
    result.unshift(preamble.content);
  }

  return result.join('\n\n');
}

/**
 * Preprocesses PROJECT.md content based on intent.
 * Enforces intent-specific section inclusion, ordering, formatting, and the 1800-token limit.
 */
export function preprocessContext(
  projectMd: string,
  intent: InjectIntent,
  errorMessage?: string
): string {
  const sections = parseSections(projectMd);
  const result: string[] = [];

  const findSection = (name: string) =>
    sections.find((s) => s.heading.toLowerCase() === name.toLowerCase());

  const getSentences = (text: string, max: number): string => {
    if (!text.trim()) return '';
    const sentences = text.split(/(?<=[.!?])\s+/);
    return sentences.slice(0, max).join(' ').trim();
  };

  const trimList = (text: string, max: number): string => {
    const lines = text.split('\n');
    const listLines: string[] = [];
    let count = 0;

    for (const line of lines) {
      if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
        if (count < max) {
          listLines.push(line);
          count++;
        }
      } else {
        if (count === 0) {
          listLines.push(line);
        }
      }
    }
    return listLines.join('\n').trim();
  };

  const collapseStructure = (text: string): string => {
    const lines = text.split('\n');
    const topLevel = lines.filter(
      (l) => !l.startsWith('    ') && !l.startsWith('\t\t')
    );
    return topLevel.join('\n').trim();
  };

  const formatGitContext = (text: string, rule: 'continue' | 'newTask' | 'debug'): string => {
    const lines = text.split('\n');
    const outputLines: string[] = [];
    let inRecentCommits = false;
    let commitCount = 0;
    const maxCommits = rule === 'continue' ? 3 : 5;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes('### Uncommitted changes')) {
        if (rule === 'newTask') {
          while (i + 1 < lines.length && !lines[i + 1].startsWith('###') && !lines[i + 1].startsWith('##')) {
            i++;
          }
          continue;
        }
        outputLines.push(line);
        continue;
      }

      if (line.includes('### Staged files')) {
        if (rule === 'newTask' || rule === 'continue') {
          while (i + 1 < lines.length && !lines[i + 1].startsWith('###') && !lines[i + 1].startsWith('##')) {
            i++;
          }
          continue;
        }
        outputLines.push(line);
        continue;
      }

      if (line.includes('### Recent commits')) {
        outputLines.push(line);
        inRecentCommits = true;
        commitCount = 0;
        continue;
      }

      if (inRecentCommits) {
        if (line.trim().startsWith('- ')) {
          if (commitCount < maxCommits) {
            outputLines.push(line);
            commitCount++;
          } else {
            inRecentCommits = false;
          }
        } else if (line.trim().startsWith('_Changed:_')) {
          if (rule !== 'newTask') {
            outputLines.push(line);
          }
        } else {
          outputLines.push(line);
        }
        continue;
      }

      outputLines.push(line);
    }

    return outputLines.join('\n').trim();
  };

  if (intent === 'continue') {
    // 1. What We're Building (2 sentences max, truncated)
    const building = findSection("What we're building") || findSection("What We're Building");
    if (building) {
      result.push(`## ${building.heading}\n\n${getSentences(building.content, 2)}`);
    }

    // 2. Current Session State
    const sessionState = findSection("Current Session State") || findSection("Current session state");
    if (sessionState) {
      result.push(`## ${sessionState.heading}\n\n${sessionState.content}`);
    }

    // 3. What's In Progress
    const inProgress = findSection("What's in progress") || findSection("What's In Progress");
    if (inProgress) {
      result.push(`## ${inProgress.heading}\n\n${inProgress.content}`);
    }

    // 4. Recent Activity (Git) — full uncommitted changes + last 3 commits
    const git = findSection("Git context") || findSection("Recent Activity (Git)") || findSection("Recent Activity");
    if (git) {
      result.push(`## ${git.heading}\n\n${formatGitContext(git.content, 'continue')}`);
    }

    // 5. Tech Stack (just the list, no descriptions)
    const tech = findSection("Tech stack") || findSection("Tech Stack");
    if (tech) {
      const listOnly = tech.content
        .split('\n')
        .filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'))
        .join('\n');
      result.push(`## ${tech.heading}\n\n${listOnly}`);
    }

    // 6. What's Next (first 3 items only)
    const next = findSection("What's next") || findSection("What's Next");
    if (next) {
      result.push(`## ${next.heading}\n\n${trimList(next.content, 3)}`);
    }
  } else if (intent === 'newTask') {
    // 1. What We're Building (full)
    const building = findSection("What we're building") || findSection("What We're Building");
    if (building) {
      result.push(`## ${building.heading}\n\n${building.content}`);
    }

    // 2. Tech Stack (full)
    const tech = findSection("Tech stack") || findSection("Tech Stack");
    if (tech) {
      result.push(`## ${tech.heading}\n\n${tech.content}`);
    }

    // 3. Repo Structure (collapsed to top level)
    const structure = findSection("File structure") || findSection("Repo Structure") || findSection("File Structure");
    if (structure) {
      result.push(`## ${structure.heading}\n\n${collapseStructure(structure.content)}`);
    }

    // 4. Conventions (full)
    const conventions = findSection("Conventions");
    if (conventions) {
      result.push(`## ${conventions.heading}\n\n${conventions.content}`);
    }

    // 5. What's Working
    const working = findSection("What's working") || findSection("What's Working");
    if (working) {
      result.push(`## ${working.heading}\n\n${working.content}`);
    }

    // 6. What's Next (full)
    const next = findSection("What's next") || findSection("What's Next");
    if (next) {
      result.push(`## ${next.heading}\n\n${next.content}`);
    }

    // 7. Recent Activity (Git) — last 5 commits only, no diff details
    const git = findSection("Git context") || findSection("Recent Activity (Git)") || findSection("Recent Activity");
    if (git) {
      result.push(`## ${git.heading}\n\n${formatGitContext(git.content, 'newTask')}`);
    }
  } else if (intent === 'debug') {
    // 1. What We're Building (1 sentence)
    const building = findSection("What we're building") || findSection("What We're Building");
    if (building) {
      result.push(`## ${building.heading}\n\n${getSentences(building.content, 1)}`);
    }

    // 2. Recent Activity (Git) — full uncommitted changes + last 5 commits + staged files
    const git = findSection("Git context") || findSection("Recent Activity (Git)") || findSection("Recent Activity");
    if (git) {
      result.push(`## ${git.heading}\n\n${formatGitContext(git.content, 'debug')}`);
    }

    // 3. What's In Progress
    const inProgress = findSection("What's in progress") || findSection("What's In Progress");
    if (inProgress) {
      result.push(`## ${inProgress.heading}\n\n${inProgress.content}`);
    }

    // 4. Tech Stack
    const tech = findSection("Tech stack") || findSection("Tech Stack");
    if (tech) {
      result.push(`## ${tech.heading}\n\n${tech.content}`);
    }

    // 5. Current Error (multi-line input collected from user)
    if (errorMessage) {
      result.push(`## Current Error\n\n${errorMessage}`);
    }

    // 6. Repo Structure
    const structure = findSection("File structure") || findSection("Repo Structure") || findSection("File Structure");
    if (structure) {
      result.push(`## ${structure.heading}\n\n${structure.content}`);
    }
  }

  // Enforce token budget by dropping lowest priority sections
  const CHARACTER_BUDGET = 1800 * 4;
  while (result.length > 0 && result.join('\n\n').length > CHARACTER_BUDGET) {
    result.pop();
  }

  return result.join('\n\n');
}
