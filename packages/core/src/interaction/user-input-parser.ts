/**
 * AI-powered User Input Parser
 *
 * OSS-safe design:
 * - No provider SDK imports.
 * - Uses CoreAdapters.ai.completeText().
 */

import type { CoreAdapters } from '../adapters'

export interface ParsedUserInput {
  intent: 'provide_data' | 'skip' | 'generate_test_data' | 'guidance' | 'choose_option'
  fields?: Record<string, string>
  selectedOption?: string
  guidanceText?: string
  summary: string
  rawInput: string
}

const PARSER_SYSTEM_PROMPT = `You parse user responses during an automated QA test. The test agent asked the user a question and the user replied in natural language. Extract structured data from their response.

Return ONLY a JSON object with these fields:
- "intent": one of "provide_data", "skip", "generate_test_data", "guidance", "choose_option"
- "fields": object of field name → value pairs (only for provide_data intent)
- "selectedOption": the option text to select (only for choose_option intent)
- "guidanceText": free-form instruction for the agent (only for guidance intent)
- "summary": brief human-readable description of what was parsed

Intent classification rules:
- "provide_data": User gives specific values to use (email, password, name, URL, etc.). Extract ALL field→value pairs.
- "skip": User wants to skip this step or move on ("skip", "skip this", "nevermind", "move on", "next")
- "generate_test_data": User wants the agent to make up realistic test data ("use dummy data", "use fake data", "generate test data", "make something up", "use any email")
- "choose_option": User is selecting from options the agent presented ("option 1", "the first one", "select Plan B")
- "guidance": User gives advice or instructions that don't fit above ("try clicking the other button", "the login is on the top right", "scroll down first")

Field extraction rules:
- Detect emails, passwords, usernames, names, phone numbers, URLs, addresses, and any key=value patterns
- For "email is X and password is Y" → fields: { "email": "X", "password": "Y" }
- For "use X@Y.com" with no field name → infer "email" from the format
- For standalone values, infer the field name from context (the agent's question)

RESPOND WITH ONLY THE JSON OBJECT. No markdown, no explanation.`

export async function parseUserInput(params: {
  adapters: CoreAdapters
  userInput: string
  agentQuestion: string
  userId?: string | null
  model?: string
}): Promise<ParsedUserInput> {
  const { adapters, userInput, agentQuestion, userId, model } = params
  const trimmed = userInput.trim()

  const fastResult = tryFastParse(trimmed)
  if (fastResult) return fastResult

  try {
    const prompt = `Agent asked: "${agentQuestion}"\n\nUser replied: "${trimmed}"\n\nParse the user's reply into structured data.`

    const text = await adapters.ai.completeText(
      {
        system: PARSER_SYSTEM_PROMPT,
        prompt,
        model: model || 'claude-sonnet-4-20250514',
        maxTokens: 512,
        temperature: 0.2,
      },
      userId ?? null
    )

    const parsed = parseJsonResponse(text)
    if (parsed) {
      return {
        intent: parsed.intent || 'guidance',
        fields: parsed.fields,
        selectedOption: parsed.selectedOption,
        guidanceText: parsed.guidanceText,
        summary: parsed.summary || trimmed,
        rawInput: trimmed,
      }
    }
  } catch {
    // fall through
  }

  return {
    intent: 'guidance',
    guidanceText: trimmed,
    summary: trimmed,
    rawInput: trimmed,
  }
}

function tryFastParse(input: string): ParsedUserInput | null {
  // Skip intents
  if (/^(skip|skip this|skip it|next|move on|nevermind|never mind|n\/a|na|none)$/i.test(input)) {
    return { intent: 'skip', summary: 'User wants to skip this step', rawInput: input }
  }

  // Generate test data intents
  if (
    /^(use (dummy|fake|test|random|any) (data|email|info|values?)|make (something|it) up|generate (test )?data|anything|whatever)$/i.test(
      input
    )
  ) {
    return { intent: 'generate_test_data', summary: 'User wants the agent to generate test data', rawInput: input }
  }

  // Single email address
  const emailMatch = input.match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/)
  if (emailMatch) {
    return {
      intent: 'provide_data',
      fields: { email: emailMatch[1] },
      summary: `Use email: ${emailMatch[1]}`,
      rawInput: input,
    }
  }

  return null
}

function parseJsonResponse(text: string): any | null {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const codeMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
    if (codeMatch) {
      try {
        return JSON.parse(codeMatch[1].trim())
      } catch {
        // ignore
      }
    }

    const first = trimmed.indexOf('{')
    const last = trimmed.lastIndexOf('}')
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1))
      } catch {
        // ignore
      }
    }

    return null
  }
}

export function formatParsedInputForAgent(parsed: ParsedUserInput): string {
  switch (parsed.intent) {
    case 'provide_data': {
      if (!parsed.fields || Object.keys(parsed.fields).length === 0) {
        return `User responded: "${parsed.rawInput}"`
      }
      const fieldLines = Object.entries(parsed.fields)
        .map(([key, value]) => `  - ${key}: ${value}`)
        .join('\n')
      return `User provided specific data to use:\n${fieldLines}\n\nPlease fill in the corresponding fields with these values.`
    }

    case 'skip':
      return 'User wants to skip this step. Move on to the next part of the test without completing this action.'

    case 'generate_test_data':
      return 'User wants you to generate realistic test/dummy data for the required fields. Make up plausible values and proceed.'

    case 'choose_option':
      return `User selected: "${parsed.selectedOption}". Please proceed with this option.`

    case 'guidance':
      return `User guidance: ${parsed.guidanceText || parsed.rawInput}`

    default:
      return `User responded: "${parsed.rawInput}"`
  }
}
