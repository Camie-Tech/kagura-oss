/**
 * @kagura-run/core - Kagura AI Test Execution Engine
 *
 * Open source agentic test execution engine.
 * See CLI_EXTRACTION_PLAN.md for implementation roadmap.
 */

// Export adapter interfaces
export * from './adapters.js'

// Export types
export * from './types.js'

// Export modules
export * from './dom-extractor.js'
export * from './utils/normalize-url.js'
export * from './providers/provider-errors.js'
export * from './ai/ai-parser.js'
export * from './eval/test-evaluator.js'
export * from './interaction/user-input-parser.js'
export * from './runner/test-runner.js'
export * from './state.js'
export * from './agent/agentic-runner.js'
export * from './agent/live-agent-runner.js'
export * from './exploration/exploration-engine.js'

// Future exports (to be implemented)
// export * from './agentic-runner'
// export * from './exploration-runner'
