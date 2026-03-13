/**
 * Skill System — Extensible agent capabilities
 *
 * Skills are modular capabilities that the AI agent can use during test execution.
 * Each skill provides:
 * - A unique name and description
 * - Configuration schema
 * - Executable actions
 * - A skill.md file that teaches the AI how to use it
 *
 * OSS users configure skills during `kagura setup`.
 * Cloud users get managed skill instances (e.g., Project Hermes for email).
 */

// ── Skill Interface ──────────────────────────────────────────────────────

export interface SkillAction<TInput = unknown, TOutput = unknown> {
  /** Unique action name within the skill (e.g., 'send', 'read', 'generate_address'). */
  name: string
  /** Human-readable description of what this action does. */
  description: string
  /** Execute the action. */
  execute(input: TInput): Promise<TOutput>
}

export interface Skill {
  /** Unique skill identifier (e.g., 'email', 'sms'). */
  name: string
  /** Human-readable description. */
  description: string
  /** Skill version. */
  version: string
  /** Whether the skill has been configured and is ready to use. */
  isConfigured(): boolean
  /** List of actions this skill exposes. */
  actions(): SkillAction[]
  /**
   * Get the skill.md content — AI-readable instructions for using this skill.
   * This is injected into the agent's system prompt when the skill is available.
   */
  getSkillPrompt(): string
}

// ── Skill Configuration ──────────────────────────────────────────────────

export interface SkillConfig {
  /** Skill identifier. */
  skillName: string
  /** Skill-specific configuration. */
  config: Record<string, unknown>
  /** Whether this skill is enabled. */
  enabled: boolean
}

// ── Skill Registry ───────────────────────────────────────────────────────

export interface SkillRegistry {
  /** Register a skill instance. */
  register(skill: Skill): void
  /** Get a skill by name. */
  get(name: string): Skill | undefined
  /** List all registered skills. */
  list(): Skill[]
  /** List only configured/ready skills. */
  listConfigured(): Skill[]
  /** Get combined skill prompts for all configured skills. */
  getSkillPrompts(): string
}
