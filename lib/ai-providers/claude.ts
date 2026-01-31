/**
 * Claude AI Provider
 * Anthropic Claude Sonnet 4 integration for mortgage scenario analysis
 */

export type ClaudeResponse = {
  parsed: any;
  model: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
  raw?: any;
};

export type ClaudeError = {
  error: string;
  status?: number;
  details?: any;
};

/**
 * Call Claude API with JSON response parsing
 * @param systemPrompt - System instructions for Claude
 * @param userMessage - User's question/scenario
 * @param maxTokens - Maximum tokens to generate (default: 4096)
 * @param retries - Number of retries on failure (default: 2)
 */
export async function callClaudeJson(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 4096,
  retries: number = 2
): Promise<ClaudeResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable not set');
  }

  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userMessage
            }
          ],
          temperature: 0.3, // Lower temperature for more consistent JSON
        }),
        signal: AbortSignal.timeout(10000), // ← ADD THIS: 10 second timeout    
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Don't retry on 4xx errors (bad request, auth, etc)
        if (response.status >= 400 && response.status < 500) {
          throw {
            error: errorData.error?.message || 'Claude API request failed',
            status: response.status,
            details: errorData,
          };
        }

        // Retry on 5xx errors
        lastError = {
          error: errorData.error?.message || 'Claude API server error',
          status: response.status,
          details: errorData,
        };

        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }

        throw lastError;
      }

      const data = await response.json();

      // Extract text content from Claude's response
      const textContent = data.content?.find((c: any) => c.type === 'text')?.text || '';

      if (!textContent) {
        throw {
          error: 'No text content in Claude response',
          status: 502,
          details: data,
        };
      }

      // Extract JSON from response (handles markdown code blocks)
      let parsed = null;

      // Try to find JSON in markdown code blocks first
      const codeBlockMatch = textContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1]);
        } catch (e) {
          // Fall through to general JSON extraction
        }
      }

      // If no code block, try to find raw JSON
      if (!parsed) {
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch (e) {
            throw {
              error: 'Failed to parse JSON from Claude response',
              status: 502,
              details: {
                parseError: e instanceof Error ? e.message : String(e),
                rawText: textContent.substring(0, 500) // First 500 chars for debugging
              },
            };
          }
        }
      }

      if (!parsed) {
        throw {
          error: 'No valid JSON found in Claude response',
          status: 502,
          details: { rawText: textContent.substring(0, 500) },
        };
      }

      return {
        parsed,
        model: data.model,
        usage: data.usage,
        raw: data,
      };

    } catch (error: any) {
      lastError = error;

      // Don't retry on parsing errors or client errors
      if (error.status && error.status < 500) {
        throw error;
      }

      // Wait before retry
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
    }
  }

  // All retries exhausted
  throw lastError || { error: 'Unknown error calling Claude API', status: 500 };
}

/**
 * Call Claude with streaming support (for future implementation)
 * Currently returns the same as callClaudeJson but designed to be extended
 */
export async function callClaudeStreaming(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 4096
): Promise<ClaudeResponse> {
  // For now, just use the regular JSON call
  // TODO: Implement actual streaming when needed
  return callClaudeJson(systemPrompt, userMessage, maxTokens);
}

/**
 * Validate that a Claude response has required scenario fields
 */
export function validateScenarioResponse(parsed: any): { valid: boolean; missing: string[] } {
  const required = [
    'plain_english_summary',
    'monthly_payment',
  ];

  const missing: string[] = [];

  for (const field of required) {
    if (!(field in parsed) || parsed[field] === null || parsed[field] === undefined) {
      missing.push(field);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Format Claude usage stats for logging
 */
export function formatClaudeUsage(usage?: { input_tokens: number; output_tokens: number }): string {
  if (!usage) return 'No usage data';

  const totalTokens = usage.input_tokens + usage.output_tokens;
  // Rough cost estimation (Claude Sonnet 4 pricing as of Jan 2025)
  const estimatedCost = (usage.input_tokens * 0.000003) + (usage.output_tokens * 0.000015);

  return `Tokens: ${totalTokens.toLocaleString()} (in: ${usage.input_tokens.toLocaleString()}, out: ${usage.output_tokens.toLocaleString()}) | Est. cost: $${estimatedCost.toFixed(4)}`;
}
