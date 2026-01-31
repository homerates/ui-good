/**
 * AI Router - Intelligent provider selection
 * Routes queries to the best AI provider based on complexity
 */

import { callClaudeJson, ClaudeResponse, formatClaudeUsage } from './claude';
import { callXaiJson, XaiResponse, formatXaiUsage } from './xai';

export type AIProvider = 'claude' | 'grok' | 'auto';

export type AIRouterResponse = {
  parsed: any;
  provider: 'claude' | 'grok';
  model: string;
  usage?: any;
  timing_ms: number;
  complexity?: 'simple' | 'medium' | 'complex';
};

/**
 * Analyze query complexity to determine best AI provider
 */
function analyzeComplexity(message: string): 'simple' | 'medium' | 'complex' {
  const m = message.toLowerCase();
  
  // Complex indicators (use Claude)
  const complexIndicators = [
    'compare',
    'what if',
    'scenario',
    'multiple',
    'various',
    'different options',
    'pros and cons',
    'advantages and disadvantages',
    'better to',
    'should i',
    'analyze',
    'detailed',
    'breakdown',
    'explain why',
    'walk me through',
  ];
  
  // Rate sensitivity patterns (complex)
  const rateSensitivity = [
    'rate comparison',
    'if rates go up',
    'if rates go down',
    'rate shock',
    'stress test',
    '+',
    '-0.5',
  ];
  
  // Simple indicators (can use Grok)
  const simpleIndicators = [
    'what is',
    'what are',
    'how much',
    'when',
    'where',
    'current rate',
    'today',
  ];
  
  // Check for complex patterns
  if (complexIndicators.some(indicator => m.includes(indicator))) {
    return 'complex';
  }
  
  if (rateSensitivity.some(pattern => m.includes(pattern))) {
    return 'complex';
  }
  
  // Check for simple patterns
  if (simpleIndicators.some(indicator => m.includes(indicator))) {
    return 'simple';
  }
  
  // Check message length (longer = more complex)
  const wordCount = message.split(/\s+/).length;
  if (wordCount > 50) return 'complex';
  if (wordCount < 15) return 'simple';
  
  return 'medium';
}

/**
 * Route to best AI provider based on query and settings
 */
export async function routeAIRequest(
  systemPrompt: string,
  message: string,
  maxTokens: number,
  preferredProvider: AIProvider = 'auto'
): Promise<AIRouterResponse> {
  const startTime = Date.now();
  const complexity = analyzeComplexity(message);
  
  // Determine which provider to use
  let provider: 'claude' | 'grok';
  
  if (preferredProvider === 'auto') {
    // Auto-route based on complexity
    provider = complexity === 'complex' ? 'claude' : 'grok';
  } else {
    provider = preferredProvider;
  }
  
  try {
    if (provider === 'claude') {
      const response = await callClaudeJson(systemPrompt, message, maxTokens);
      const timing_ms = Date.now() - startTime;
      
      console.log(`[AI Router] Claude used (${complexity}) - ${formatClaudeUsage(response.usage)} - ${timing_ms}ms`);
      
      return {
        parsed: response.parsed,
        provider: 'claude',
        model: response.model,
        usage: response.usage,
        timing_ms,
        complexity,
      };
    } else {
      const response = await callXaiJson(systemPrompt, message, maxTokens);
      const timing_ms = Date.now() - startTime;
      
      console.log(`[AI Router] Grok used (${complexity}) - ${formatXaiUsage(response.usage)} - ${timing_ms}ms`);
      
      return {
        parsed: response.parsed,
        provider: 'grok',
        model: response.model,
        usage: response.usage,
        timing_ms,
        complexity,
      };
    }
  } catch (error: any) {
    // Fallback logic: if one provider fails, try the other
    const fallbackProvider = provider === 'claude' ? 'grok' : 'claude';
    
    console.warn(`[AI Router] ${provider} failed, falling back to ${fallbackProvider}:`, error?.error || error?.message || error);
    
    try {
      if (fallbackProvider === 'claude') {
        const response = await callClaudeJson(systemPrompt, message, maxTokens);
        const timing_ms = Date.now() - startTime;
        
        console.log(`[AI Router] Claude fallback succeeded - ${formatClaudeUsage(response.usage)} - ${timing_ms}ms`);
        
        return {
          parsed: response.parsed,
          provider: 'claude',
          model: response.model,
          usage: response.usage,
          timing_ms,
          complexity,
        };
      } else {
        const response = await callXaiJson(systemPrompt, message, maxTokens);
        const timing_ms = Date.now() - startTime;
        
        console.log(`[AI Router] Grok fallback succeeded - ${formatXaiUsage(response.usage)} - ${timing_ms}ms`);
        
        return {
          parsed: response.parsed,
          provider: 'grok',
          model: response.model,
          usage: response.usage,
          timing_ms,
          complexity,
        };
      }
    } catch (fallbackError: any) {
      // Both providers failed
      console.error(`[AI Router] Both providers failed. Original:`, error, 'Fallback:', fallbackError);
      throw error; // Throw original error
    }
  }
}

/**
 * Compare responses from both providers (for A/B testing)
 */
export async function compareProviders(
  systemPrompt: string,
  message: string,
  maxTokens: number
): Promise<{
  claude: AIRouterResponse | null;
  grok: AIRouterResponse | null;
  winner?: 'claude' | 'grok' | 'tie';
}> {
  const [claudeResult, grokResult] = await Promise.allSettled([
    routeAIRequest(systemPrompt, message, maxTokens, 'claude'),
    routeAIRequest(systemPrompt, message, maxTokens, 'grok'),
  ]);
  
  const claude = claudeResult.status === 'fulfilled' ? claudeResult.value : null;
  const grok = grokResult.status === 'fulfilled' ? grokResult.value : null;
  
  // Simple winner determination (can be enhanced with more criteria)
  let winner: 'claude' | 'grok' | 'tie' | undefined;
  
  if (claude && !grok) winner = 'claude';
  else if (grok && !claude) winner = 'grok';
  else if (claude && grok) {
    // Compare by speed for now (can add quality metrics later)
    winner = claude.timing_ms < grok.timing_ms ? 'claude' : 'grok';
  }
  
  return { claude, grok, winner };
}
