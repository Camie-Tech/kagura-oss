import { describe, expect, it } from 'vitest'

import * as core from '../src/index'

describe('@kagura-run/core exports', () => {
  it('exports core modules', () => {
    expect(typeof core).toBe('object')
    // dom extractor
    expect(typeof (core as any).extractPageAnalysis).toBe('function')
    expect(typeof (core as any).summarizePageAnalysis).toBe('function')

    // utilities
    expect(typeof (core as any).normalizeUrl).toBe('function')
    expect(typeof (core as any).normalizeProviderError).toBe('function')

    // AI parser
    expect(typeof (core as any).parseNaturalLanguageTest).toBe('function')
    expect(typeof (core as any).parseWithPageAnalysis).toBe('function')

    // evaluator
    expect(typeof (core as any).evaluateTestResult).toBe('function')

    // user input parser
    expect(typeof (core as any).parseUserInput).toBe('function')
    expect(typeof (core as any).formatParsedInputForAgent).toBe('function')

    // test runner
    expect(typeof (core as any).executeTest).toBe('function')
  })

  it('exports skills system', () => {
    // registry
    expect(typeof (core as any).createSkillRegistry).toBe('function')

    // email skill
    expect(typeof (core as any).createEmailSkill).toBe('function')
    expect(typeof (core as any).createEmailCredentialProvider).toBe('function')

    // address-generator helpers
    expect(typeof (core as any).generateNextAddress).toBe('function')
    expect(typeof (core as any).generateVariation).toBe('function')
    expect(typeof (core as any).generatePassword).toBe('function')
    expect(typeof (core as any).parseBaseEmail).toBe('function')
  })
})
