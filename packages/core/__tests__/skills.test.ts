import { describe, expect, it, vi } from 'vitest'
import {
  createSkillRegistry,
  createEmailSkill,
  createEmailCredentialProvider,
  generateVariation,
  generatePassword,
  parseBaseEmail,
  generateNextAddress,
} from '../src/skills/index.js'
import type { EmailSkillConfig } from '../src/skills/email/types.js'

// ── parseBaseEmail ────────────────────────────────────────────────────────

describe('parseBaseEmail', () => {
  it('splits a plain email', () => {
    const { localPart, domain } = parseBaseEmail('daniel@camie.tech')
    expect(localPart).toBe('daniel')
    expect(domain).toBe('camie.tech')
  })

  it('strips an existing +suffix', () => {
    const { localPart, domain } = parseBaseEmail('daniel+5@camie.tech')
    expect(localPart).toBe('daniel')
    expect(domain).toBe('camie.tech')
  })

  it('throws for invalid email', () => {
    expect(() => parseBaseEmail('notanemail')).toThrow('Invalid email address')
  })
})

// ── generateVariation ─────────────────────────────────────────────────────

describe('generateVariation', () => {
  it('appends +N to local part', () => {
    expect(generateVariation('daniel@camie.tech', 1)).toBe('daniel+1@camie.tech')
    expect(generateVariation('daniel@camie.tech', 99)).toBe('daniel+99@camie.tech')
  })

  it('handles base email that already has a +suffix', () => {
    // Should strip the old suffix and apply the new variation
    expect(generateVariation('daniel+3@camie.tech', 7)).toBe('daniel+7@camie.tech')
  })
})

// ── generatePassword ──────────────────────────────────────────────────────

describe('generatePassword', () => {
  it('returns a 16-character string', () => {
    expect(generatePassword()).toHaveLength(16)
  })

  it('generates unique passwords', () => {
    const a = generatePassword()
    const b = generatePassword()
    expect(a).not.toBe(b)
  })
})

// ── generateNextAddress ───────────────────────────────────────────────────

describe('generateNextAddress', () => {
  it('returns the first variation when no availability check is given', async () => {
    const result = await generateNextAddress('daniel@camie.tech', 1)
    expect(result).not.toBeNull()
    expect(result!.email).toBe('daniel+1@camie.tech')
    expect(result!.variation).toBe(1)
    expect(result!.password).toHaveLength(16)
  })

  it('skips taken variations and finds the next available slot', async () => {
    // First two variations taken, third available
    const taken = new Set(['daniel+1@camie.tech', 'daniel+2@camie.tech'])
    const isAvailable = async (email: string) => !taken.has(email)

    const result = await generateNextAddress('daniel@camie.tech', 1, isAvailable)
    expect(result).not.toBeNull()
    expect(result!.email).toBe('daniel+3@camie.tech')
    expect(result!.variation).toBe(3)
  })

  it('applies exponential backoff after 4 sequential retries', async () => {
    const visited: string[] = []
    // Only the 11th variation is free (to force exponential jumps)
    const isAvailable = async (email: string) => {
      visited.push(email)
      return email === 'daniel+11@camie.tech'
    }

    const result = await generateNextAddress('daniel@camie.tech', 1, isAvailable)
    expect(result).not.toBeNull()
    expect(result!.email).toBe('daniel+11@camie.tech')
    // Make sure it visited intermediate addresses (exponential jumps applied)
    expect(visited.length).toBeGreaterThan(4)
  })

  it('returns null when all retries exhausted', async () => {
    const isAvailable = async (_email: string) => false
    const result = await generateNextAddress('daniel@camie.tech', 1, isAvailable, 3)
    expect(result).toBeNull()
  })
})

// ── createSkillRegistry ───────────────────────────────────────────────────

describe('createSkillRegistry', () => {
  const makeStubSkill = (name: string, configured: boolean) => ({
    name,
    description: `Stub skill: ${name}`,
    version: '1.0.0',
    isConfigured: () => configured,
    actions: () => [],
    getSkillPrompt: () => `# ${name} skill`,
  })

  it('registers and retrieves a skill by name', () => {
    const registry = createSkillRegistry()
    const skill = makeStubSkill('test', true)
    registry.register(skill)
    expect(registry.get('test')).toBe(skill)
  })

  it('throws when registering duplicate skill names', () => {
    const registry = createSkillRegistry()
    registry.register(makeStubSkill('dup', true))
    expect(() => registry.register(makeStubSkill('dup', true))).toThrow(
      'Skill "dup" is already registered'
    )
  })

  it('listConfigured returns only configured skills', () => {
    const registry = createSkillRegistry()
    registry.register(makeStubSkill('ready', true))
    registry.register(makeStubSkill('not-ready', false))
    const configured = registry.listConfigured()
    expect(configured).toHaveLength(1)
    expect(configured[0].name).toBe('ready')
  })

  it('getSkillPrompts returns empty string when no configured skills', () => {
    const registry = createSkillRegistry()
    registry.register(makeStubSkill('not-ready', false))
    expect(registry.getSkillPrompts()).toBe('')
  })

  it('getSkillPrompts wraps each configured skill prompt in <skill> tags', () => {
    const registry = createSkillRegistry()
    registry.register(makeStubSkill('email', true))
    const prompts = registry.getSkillPrompts()
    expect(prompts).toContain('<skill name="email"')
    expect(prompts).toContain('# email skill')
    expect(prompts).toContain('</skill>')
  })
})

// ── createEmailSkill ──────────────────────────────────────────────────────

describe('createEmailSkill', () => {
  const baseConfig: EmailSkillConfig = {
    baseEmail: 'test@example.com',
    imap: {
      host: 'imap.example.com',
      port: 993,
      secure: true,
      auth: { user: 'test@example.com', pass: 'secret' },
    },
  }

  it('is configured when imap.host and baseEmail are set', () => {
    const skill = createEmailSkill(baseConfig)
    expect(skill.isConfigured()).toBe(true)
  })

  it('is not configured when imap.host is missing', () => {
    const skill = createEmailSkill({
      ...baseConfig,
      imap: { ...baseConfig.imap, host: '' },
    })
    expect(skill.isConfigured()).toBe(false)
  })

  it('exposes correct skill metadata', () => {
    const skill = createEmailSkill(baseConfig)
    expect(skill.name).toBe('email')
    expect(skill.version).toBe('1.0.0')
  })

  it('includes generate_address, read_email, extract_code, extract_link actions', () => {
    const skill = createEmailSkill(baseConfig)
    const names = skill.actions().map(a => a.name)
    expect(names).toContain('generate_address')
    expect(names).toContain('read_email')
    expect(names).toContain('extract_code')
    expect(names).toContain('extract_link')
  })

  it('does NOT include send_email action when smtp is not configured', () => {
    const skill = createEmailSkill(baseConfig)
    const names = skill.actions().map(a => a.name)
    expect(names).not.toContain('send_email')
  })

  it('includes send_email action when smtp is configured', () => {
    const skill = createEmailSkill({
      ...baseConfig,
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'test@example.com', pass: 'secret' },
      },
    })
    const names = skill.actions().map(a => a.name)
    expect(names).toContain('send_email')
  })

  it('getSkillPrompt returns non-empty string with key headings', () => {
    const skill = createEmailSkill(baseConfig)
    const prompt = skill.getSkillPrompt()
    expect(prompt).toContain('Email Skill')
    expect(prompt).toContain('generate_address')
    expect(prompt).toContain('Exponential Backoff')
    expect(prompt).toContain('Auth Profile Integration')
  })

  it('generate_address action returns email with correct variation', async () => {
    const skill = createEmailSkill({ ...baseConfig, variationCounter: 5 })
    const action = skill.actions().find(a => a.name === 'generate_address')!
    const result = await action.execute({}) as any
    expect(result).not.toBeNull()
    expect(result.email).toBe('test+5@example.com')
    expect(result.variation).toBe(5)
  })

  it('generate_address counter advances after each call', async () => {
    const skill = createEmailSkill({ ...baseConfig, variationCounter: 1 })
    const action = skill.actions().find(a => a.name === 'generate_address')!
    const first = await action.execute({}) as any
    const second = await action.execute({}) as any
    expect(second.variation).toBeGreaterThan(first.variation)
  })
})

// ── createEmailCredentialProvider ─────────────────────────────────────────

describe('createEmailCredentialProvider', () => {
  const baseConfig: EmailSkillConfig = {
    baseEmail: 'daniel@camie.tech',
    imap: {
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: 'daniel@camie.tech', pass: 'app-password' },
    },
    variationCounter: 1,
  }

  it('returns stored credentials when they exist', async () => {
    const saved = [{ id: 'cred:1', label: 'main', values: { email: 'user@x.com', password: 'pw' } }]
    const baseProvider = {
      getForUrl: vi.fn(async () => saved),
      recordUsage: vi.fn(async () => {}),
    }
    const provider = createEmailCredentialProvider(baseProvider, baseConfig)
    const result = await provider.getForUrl('user1', 'https://app.example.com')
    expect(result).toBe(saved)
    expect(baseProvider.getForUrl).toHaveBeenCalledWith('user1', 'https://app.example.com')
  })

  it('auto-generates credentials when no saved credentials exist', async () => {
    const baseProvider = {
      getForUrl: vi.fn(async () => []),
      recordUsage: vi.fn(async () => {}),
    }
    const provider = createEmailCredentialProvider(baseProvider, baseConfig)
    const result = await provider.getForUrl(null, 'https://new-site.com')
    expect(result).toHaveLength(1)
    expect(result[0].id).toMatch(/^generated:/)
    expect(result[0].values.email).toMatch(/daniel\+\d+@camie\.tech/)
    expect(result[0].values.password).toHaveLength(16)
  })

  it('delegates recordUsage to base provider for non-generated credentials', async () => {
    const baseProvider = {
      getForUrl: vi.fn(async () => []),
      recordUsage: vi.fn(async () => {}),
    }
    const provider = createEmailCredentialProvider(baseProvider, baseConfig)
    await provider.recordUsage('cred:123')
    expect(baseProvider.recordUsage).toHaveBeenCalledWith('cred:123')
  })

  it('does NOT delegate recordUsage for generated credentials', async () => {
    const baseProvider = {
      getForUrl: vi.fn(async () => []),
      recordUsage: vi.fn(async () => {}),
    }
    const provider = createEmailCredentialProvider(baseProvider, baseConfig)
    await provider.recordUsage('generated:5')
    expect(baseProvider.recordUsage).not.toHaveBeenCalled()
  })
})
