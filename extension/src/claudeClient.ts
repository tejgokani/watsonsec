import * as vscode from 'vscode';
import { CodeChunk, Finding } from './types';
import { buildPrompt, detectProjectType } from './promptEngine';
import { parseFindings } from './findingParser';

const MAX_CONCURRENT = 3;
const MAX_QUEUE = 50;
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;

let activeCount = 0;
const queue: Array<() => void> = [];
let cachedModel: vscode.LanguageModelChat | null = null;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (queue.length >= MAX_QUEUE) {
      reject(new Error('WatsonSec: scan queue full — try again after current scans finish.'));
      return;
    }
    const run = () => {
      activeCount++;
      fn()
        .then(resolve, reject)
        .finally(() => {
          activeCount--;
          if (queue.length > 0) queue.shift()!();
        });
    };
    if (activeCount < MAX_CONCURRENT) run();
    else queue.push(run);
  });
}

async function selectModel(): Promise<vscode.LanguageModelChat> {
  if (cachedModel) return cachedModel;

  const copilot = await vscode.lm.selectChatModels({ vendor: 'copilot' });
  if (copilot.length > 0) { cachedModel = copilot[0]; return cachedModel; }

  const any = await vscode.lm.selectChatModels();
  if (any.length > 0) { cachedModel = any[0]; return cachedModel; }

  throw new Error(
    'WatsonSec: No language model available. Open a session with any AI agent (Copilot, Cursor, Claude, etc.) and try again.'
  );
}

function isRetryable(err: unknown): boolean {
  if (err instanceof vscode.LanguageModelError) {
    return err.code === vscode.LanguageModelError.Blocked().code ||
           err.code === vscode.LanguageModelError.NotFound().code;
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return msg.includes('rate limit') || msg.includes('too many') || msg.includes('overloaded');
}

async function withRetry<T>(fn: () => Promise<T>, token: vscode.CancellationToken): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (token.isCancellationRequested) throw new vscode.CancellationError();
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Invalidate model cache on LM errors so next attempt picks fresh model
      if (err instanceof vscode.LanguageModelError) cachedModel = null;
      if (!isRetryable(err)) throw err;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
      await new Promise<void>(res => setTimeout(res, delay));
    }
  }
  throw lastErr;
}

export async function analyzeChunk(
  chunk: CodeChunk,
  workspaceRoot: string,
  token: vscode.CancellationToken = new vscode.CancellationTokenSource().token
): Promise<Finding[]> {
  return enqueue(async () => {
    if (token.isCancellationRequested) throw new vscode.CancellationError();

    const model = await selectModel();
    const projectType = await detectProjectType(workspaceRoot);
    const { system, user } = buildPrompt(chunk, projectType);
    const messages = [vscode.LanguageModelChatMessage.User(`${system}\n\n${user}`)];

    const text = await withRetry(async () => {
      const response = await model.sendRequest(messages, {}, token);
      let out = '';
      for await (const part of response.stream) {
        if (token.isCancellationRequested) throw new vscode.CancellationError();
        if (part instanceof vscode.LanguageModelTextPart) out += part.value;
      }
      return out;
    }, token);

    return parseFindings(text, chunk.filePath, chunk.startLine - 1);
  });
}
