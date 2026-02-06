import { Config } from '../config/validator';
import { IssueAnalysis, IssueAnalysisSchema, GitHubIssue } from './types';
import { buildIssueAnalysisPrompt } from './prompts/issue-analysis';

type ModelTier = 'auto' | 'basic' | 'advanced';

export class IssueAnalyzer {
  private readonly apiKey: string;
  private readonly modelTier: ModelTier;

  constructor(config: Pick<Config, 'gemini'>) {
    this.apiKey = config.gemini.api_key;
    this.modelTier = config.gemini.model_tier;
  }

  async analyzeIssue(issue: GitHubIssue): Promise<IssueAnalysis> {
    const title = issue.title;
    const body = issue.body ?? '';
    const labels = (issue.labels ?? []).map((l) => l.name).filter((n): n is string => typeof n === 'string' && n.length > 0);

    const prompt = buildIssueAnalysisPrompt({ title, body, labels });

    const text = await this.generateText(prompt);
    const jsonText = extractJsonObject(text);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      throw new Error(`IssueAnalyzer: failed to parse model JSON output. Raw output: ${text}`, {
        cause: err,
      });
    }

    const validated = IssueAnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`IssueAnalyzer: invalid analysis schema: ${validated.error.message}`);
    }

    return validated.data;
  }

  private async generateText(prompt: string): Promise<string> {
    const modelsToTry = selectGeminiModels(this.modelTier);
    let lastError: Error | undefined;

    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
          },
        }),
      });

      if (!res.ok) {
        const errBody = await safeReadBody(res);
        const err = new Error(`IssueAnalyzer: Gemini API error ${res.status} ${res.statusText}: ${errBody}`);
        lastError = err;

        // If the model is not found / not supported, try the next model.
        if (res.status === 404) {
          continue;
        }

        throw err;
      }

      const json = (await res.json()) as GeminiGenerateContentResponse;
      const text =
        json.candidates?.[0]?.content?.parts
          ?.map((p) => p.text)
          .filter(Boolean)
          .join('') ?? '';

      if (!text) {
        throw new Error('IssueAnalyzer: Gemini API returned empty text');
      }

      return text;
    }

    // If all configured models failed with 404, try discovering available models.
    const discoveredModels = await listGeminiModelsSupportingGenerateContent(this.apiKey);
    for (const model of discoveredModels) {
      try {
        return await generateTextWithModel({ apiKey: this.apiKey, model, prompt });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
    }

    throw lastError ?? new Error(`IssueAnalyzer: Gemini API error: no models succeeded. Attempted: ${modelsToTry.join(', ')}`);
  }
}

function selectGeminiModels(modelTier: ModelTier): string[] {
  // v1beta model IDs can vary by account/project. We try a small ordered list.
  // The "*-latest" aliases are commonly available.
  switch (modelTier) {
    case 'advanced':
      return ['gemini-1.5-pro-latest', 'gemini-1.5-pro'];
    case 'basic':
      return ['gemini-1.5-flash-latest', 'gemini-1.5-flash'];
    case 'auto':
    default:
      return ['gemini-1.5-flash-latest', 'gemini-1.5-flash'];
  }
}

async function safeReadBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function generateTextWithModel(input: { apiKey: string; model: string; prompt: string }): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: input.prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await safeReadBody(res);
    throw new Error(`IssueAnalyzer: Gemini API error ${res.status} ${res.statusText}: ${errBody}`);
  }

  const json = (await res.json()) as GeminiGenerateContentResponse;
  const text =
    json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join('') ?? '';

  if (!text) {
    throw new Error('IssueAnalyzer: Gemini API returned empty text');
  }

  return text;
}

async function listGeminiModelsSupportingGenerateContent(apiKey: string): Promise<string[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    return [];
  }

  const json = (await res.json()) as GeminiListModelsResponse;
  const models = json.models ?? [];

  return (
    models
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m) => m.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
      // API returns names like "models/<id>"; our endpoint needs just the id.
      .map((n) => n.replace(/^models\//, ''))
      // Prefer gemini models first.
      .sort((a, b) => {
        const aIsGemini = a.toLowerCase().includes('gemini');
        const bIsGemini = b.toLowerCase().includes('gemini');
        if (aIsGemini === bIsGemini) return 0;
        return aIsGemini ? -1 : 1;
      })
  );
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();

  // Remove fenced code blocks if the model included them.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const unfenced = fenceMatch?.[1] ? fenceMatch[1].trim() : trimmed;

  // Try to locate the first JSON object.
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    return unfenced;
  }

  return unfenced.slice(start, end + 1);
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type GeminiListModelsResponse = {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
};
