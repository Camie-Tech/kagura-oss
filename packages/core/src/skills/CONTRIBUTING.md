# Contributing Skills

Skills are modular capabilities that extend what the AI agent can do during test execution. This guide shows how to create a new skill.

## Architecture

```
packages/core/src/skills/
├── types.ts           # Skill, SkillAction, SkillRegistry interfaces
├── registry.ts        # SkillRegistry factory
├── index.ts           # Barrel exports
├── CONTRIBUTING.md    # This file
└── email/             # Example: Email skill
    ├── index.ts       # Skill factory + actions
    ├── types.ts       # Skill-specific types
    ├── skill.md       # AI-readable skill documentation
    ├── address-generator.ts
    └── credential-generator.ts
```

## Creating a New Skill

### 1. Create the directory

```
packages/core/src/skills/my-skill/
├── index.ts    # createMySkill() factory
├── types.ts    # Config and types
└── skill.md    # AI instructions
```

### 2. Define types

```typescript
// types.ts
export interface MySkillConfig {
  apiKey: string
  // ... skill-specific config
}
```

### 3. Implement the Skill interface

```typescript
// index.ts
import type { Skill, SkillAction } from '../types.js'
import type { MySkillConfig } from './types.js'

export function createMySkill(config: MySkillConfig): Skill {
  return {
    name: 'my-skill',
    description: 'What this skill does',
    version: '1.0.0',

    isConfigured(): boolean {
      return Boolean(config.apiKey)
    },

    actions(): SkillAction[] {
      return [
        {
          name: 'do_something',
          description: 'Does something useful',
          async execute(input) {
            // Implementation
            return result
          },
        },
      ]
    },

    getSkillPrompt(): string {
      return SKILL_PROMPT
    },
  }
}

const SKILL_PROMPT = `# My Skill
Instructions for the AI agent on how and when to use this skill...
`
```

### 4. Export from the skills index

```typescript
// skills/index.ts
export * from './my-skill/index.js'
export type { MySkillConfig } from './my-skill/types.js'
```

### 5. Register in the CLI

In `packages/cli/src/commands/run.ts`, register the skill in the `SkillRegistry`:

```typescript
if (config.mySkill) {
  const mySkill = createMySkill(config.mySkill)
  skills.register(mySkill)
}
```

## Key Principles

1. **OSS-first**: Skills live in `@kagura-run/core`. Cloud adopts immediately.
2. **Adapter-driven**: Skills never import cloud-specific code.
3. **AI-readable**: Every skill includes a `getSkillPrompt()` that teaches the AI how to use it.
4. **Optional**: Skills degrade gracefully when not configured.
5. **Composable**: Skills can be combined (e.g., email + auth profiles).
