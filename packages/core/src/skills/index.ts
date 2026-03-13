/**
 * Skills System — Extensible agent capabilities
 *
 * Skills provide modular capabilities that the AI agent can use during test execution.
 * Each skill follows the skill.md pattern: a structured prompt teaches the AI
 * how and when to use the skill's actions.
 *
 * Adding a new skill:
 * 1. Create a directory under src/skills/<skill-name>/
 * 2. Implement the Skill interface from ./types.ts
 * 3. Include a getSkillPrompt() that returns AI instructions
 * 4. Export from this index file
 * 5. Register in the SkillRegistry during adapter setup
 */

// Skill system types and registry
export * from './types.js'
export * from './registry.js'

// Built-in skills
export * from './email/index.js'
export type {
  EmailSkillConfig,
  ImapConfig,
  SmtpConfig,
  ReadEmailOptions,
  SendEmailOptions,
  GeneratedAddress,
} from './email/types.js'
export {
  generateNextAddress,
  generateVariation,
  generatePassword,
  parseBaseEmail,
} from './email/address-generator.js'
export { createEmailCredentialProvider } from './email/credential-generator.js'
