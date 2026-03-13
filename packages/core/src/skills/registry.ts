/**
 * Skill Registry — Central registry for agent skills.
 *
 * Skills are registered at startup and their prompts are injected
 * into the AI agent's context so it knows what capabilities are available.
 */

import type { Skill, SkillRegistry } from './types.js'

export function createSkillRegistry(): SkillRegistry {
  const skills = new Map<string, Skill>()

  return {
    register(skill: Skill): void {
      if (skills.has(skill.name)) {
        throw new Error(`Skill "${skill.name}" is already registered`)
      }
      skills.set(skill.name, skill)
    },

    get(name: string): Skill | undefined {
      return skills.get(name)
    },

    list(): Skill[] {
      return Array.from(skills.values())
    },

    listConfigured(): Skill[] {
      return Array.from(skills.values()).filter(s => s.isConfigured())
    },

    getSkillPrompts(): string {
      const configured = Array.from(skills.values()).filter(s => s.isConfigured())
      if (configured.length === 0) return ''

      const sections = configured.map(skill => {
        return `<skill name="${skill.name}" version="${skill.version}">\n${skill.getSkillPrompt()}\n</skill>`
      })

      return `\n\n# Available Skills\n\nYou have access to the following skills. Use them when the test scenario requires it.\n\n${sections.join('\n\n')}`
    },
  }
}
