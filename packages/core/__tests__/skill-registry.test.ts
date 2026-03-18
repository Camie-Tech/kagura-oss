import { describe, expect, it } from 'vitest'
import { createSkillRegistry } from '../src/skills/registry'
import type { Skill, SkillAction } from '../src/skills/types'

function makeDummySkill(name: string, configured = true): Skill {
  return {
    name,
    description: `${name} skill`,
    version: '1.0.0',
    isConfigured: () => configured,
    actions: () => [
      { name: 'test_action', description: 'A test action', execute: async () => 'ok' },
    ],
    getSkillPrompt: () => `# ${name} Skill\n\nThis is the ${name} skill prompt.`,
  }
}

describe('SkillRegistry', () => {
  it('registers and retrieves a skill', () => {
    const registry = createSkillRegistry()
    const skill = makeDummySkill('email')
    registry.register(skill)

    expect(registry.get('email')).toBe(skill)
  })

  it('returns undefined for unregistered skill', () => {
    const registry = createSkillRegistry()
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('throws when registering duplicate skill name', () => {
    const registry = createSkillRegistry()
    registry.register(makeDummySkill('email'))

    expect(() => registry.register(makeDummySkill('email'))).toThrow(
      'Skill "email" is already registered'
    )
  })

  it('lists all registered skills', () => {
    const registry = createSkillRegistry()
    registry.register(makeDummySkill('email'))
    registry.register(makeDummySkill('sms'))

    const all = registry.list()
    expect(all).toHaveLength(2)
    expect(all.map(s => s.name)).toEqual(['email', 'sms'])
  })

  it('lists only configured skills', () => {
    const registry = createSkillRegistry()
    registry.register(makeDummySkill('email', true))
    registry.register(makeDummySkill('sms', false))

    const configured = registry.listConfigured()
    expect(configured).toHaveLength(1)
    expect(configured[0].name).toBe('email')
  })

  it('returns empty string when no skills are configured', () => {
    const registry = createSkillRegistry()
    expect(registry.getSkillPrompts()).toBe('')
  })

  it('returns empty string when all skills are unconfigured', () => {
    const registry = createSkillRegistry()
    registry.register(makeDummySkill('email', false))
    expect(registry.getSkillPrompts()).toBe('')
  })

  it('generates combined skill prompts for configured skills', () => {
    const registry = createSkillRegistry()
    registry.register(makeDummySkill('email', true))
    registry.register(makeDummySkill('sms', true))

    const prompts = registry.getSkillPrompts()
    expect(prompts).toContain('# Available Skills')
    expect(prompts).toContain('<skill name="email" version="1.0.0">')
    expect(prompts).toContain('<skill name="sms" version="1.0.0">')
    expect(prompts).toContain('# email Skill')
    expect(prompts).toContain('# sms Skill')
  })

  it('excludes unconfigured skills from prompts', () => {
    const registry = createSkillRegistry()
    registry.register(makeDummySkill('email', true))
    registry.register(makeDummySkill('sms', false))

    const prompts = registry.getSkillPrompts()
    expect(prompts).toContain('<skill name="email"')
    expect(prompts).not.toContain('<skill name="sms"')
  })
})
