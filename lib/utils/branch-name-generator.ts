import { generateText } from 'ai'
import { customAlphabet } from 'nanoid'

export interface BranchNameOptions {
  description: string
  repoName?: string
  context?: string
}

export async function generateBranchName(options: BranchNameOptions): Promise<string> {
  const { description, repoName, context } = options

  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error('AI_GATEWAY_API_KEY environment variable is required')
  }

  // Create the prompt for branch name generation
  const prompt = `Generate a concise, descriptive Git branch name for the following task:

Description: ${description}
${repoName ? `Repository: ${repoName}` : ''}
${context ? `Additional context: ${context}` : ''}

Requirements:
- Use lowercase letters, numbers, and hyphens only
- Keep it under 50 characters
- Be descriptive but concise
- Use conventional prefixes like feature/, fix/, chore/, docs/ when appropriate
- Make it readable and meaningful

Examples of good branch names:
- feature/user-authentication
- fix/memory-leak-in-parser
- chore/update-dependencies
- docs/api-documentation

Return ONLY the branch name, nothing else.`

  try {
    // Generate branch name using AI SDK 5 with AI Gateway
    const result = await generateText({
      model: 'openai/gpt-5-nano',
      prompt,
      temperature: 0.3,
    })

    // Clean up the response (remove any extra whitespace or quotes)
    const baseBranchName = result.text.trim().replace(/^["']|["']$/g, '')

    // Generate a 6-character alphanumeric hash to avoid conflicts
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    const nanoid = customAlphabet(alphabet, 6)
    const hash = nanoid()
    const suffix = `-${hash}`

    // Sanitize and fit Git branch name rules; model output can exceed length or include bad chars
    const sanitizedBase = baseBranchName
      .toLowerCase()
      .replace(/[^a-z0-9-/]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')

    const maxBaseLen = Math.max(1, 50 - suffix.length)
    const trimmedBase = (sanitizedBase.slice(0, maxBaseLen).replace(/-+$/g, '') || 'agent').slice(0, maxBaseLen)
    let branchName = `${trimmedBase}${suffix}`

    if (branchName.length > 50) {
      branchName = branchName.slice(0, 50)
    }

    return branchName
  } catch (error) {
    console.error('Branch name generation error:', error)
    throw new Error(`Failed to generate branch name: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export function createFallbackBranchName(taskId: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  return `agent/${timestamp}-${taskId.slice(0, 8)}`
}
