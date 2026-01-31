/**
 * XAI (Grok) AI Provider
 * Wrapper for existing Grok integration with improved error handling
 */

export type XaiResponse = {
  parsed: any;
  model: string;
  usage?: any;
  raw?: any;
};

export type XaiError = {
  error: string;
  status?: number;
  details?: any;
};

/**
 * Call XAI Grok API with JSON response parsing
 * @param systemPrompt - System instructions
 * @param userMessage - User's question
 * @param maxTokens - Maximum tokens (default: 900 for Grok)
 * @param retries - Number of retries on failure
 */
export async function callXaiJson(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 900,
  retries: number = 2
): Promise<XaiResponse> {
  const apiKey = process.env.XAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('XAI_API_KEY environment variable not set');
  }

  let lastError: any = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'grok-beta',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Don't retry on 4xx errors
        if (response.status >= 400 && response.status < 500) {
          throw {
            error: errorData.error?.message || 'XAI API request failed',
            status: response.status,
            details: errorData,
          };
        }
        
        // Retry on 5xx errors
        lastError = {
          error: errorData.error?.message || 'XAI API server error',
          status: response.status,
          details: errorData,
        };
        
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }
        
        throw lastError;
      }

      const data = await response.json();
      
      const textContent = data.choices?.[0]?.message?.content || '';
      
      if (!textContent) {
        throw {
          error: 'No content in XAI response',
          status: 502,
          details: data,
        };
      }

      // Extract JSON from response
      let parsed = null;
      
      // Try markdown code block first
      const codeBlockMatch = textContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1]);
        } catch (e) {
          // Fall through
        }
      }
      
      // Try raw JSON
      if (!parsed) {
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch (e) {
            throw {
              error: 'Failed to parse JSON from XAI response',
              status: 502,
              details: { 
                parseError: e instanceof Error ? e.message : String(e),
                rawText: textContent.substring(0, 500)
              },
            };
          }
        }
      }
      
      if (!parsed) {
        throw {
          error: 'No valid JSON found in XAI response',
          status: 502,
          details: { rawText: textContent.substring(0, 500) },
        };
      }

      return {
        parsed,
        model: data.model || 'grok-beta',
        usage: data.usage,
        raw: data,
      };
      
    } catch (error: any) {
      lastError = error;
      
      if (error.status && error.status < 500) {
        throw error;
      }
      
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
    }
  }
  
  throw lastError || { error: 'Unknown error calling XAI API', status: 500 };
}

/**
 * Format XAI usage stats for logging
 */
export function formatXaiUsage(usage?: any): string {
  if (!usage) return 'No usage data';
  
  const totalTokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
  
  return `Tokens: ${totalTokens.toLocaleString()} (in: ${usage.prompt_tokens || 0}, out: ${usage.completion_tokens || 0})`;
}
