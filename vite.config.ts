import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

type DialoguePayload = {
  profile?: { displayName?: string; description?: string };
  persona?: string;
  tacticalHint?: string;
  playerMessage?: string;
  pressure?: number;
  objectiveCollected?: number;
  objectiveNeed?: number;
  history?: Array<{ speaker: string; content: string }>;
  memory?: string;
};

function loadLoreContext(): string {
  const lorePath = resolve(process.cwd(), 'npc-lore.md');
  if (!existsSync(lorePath)) {
    return [
      '长城守卫军被魔种围困，外部补给线已经断裂。',
      '百里守约受命出城搜集军粮、药品和守城器械零件。',
      '任务目标是尽快回收关键补给，维持防线。',
    ].join('\n');
  }
  return readFileSync(lorePath, 'utf8').trim();
}

const LORE_CONTEXT = loadLoreContext();

function getApiConfig(env: Record<string, string>) {
  const apiKey = env.HUNYUAN_API_KEY || env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '';
  const baseUrl =
    env.HUNYUAN_BASE_URL ||
    env.OPENAI_BASE_URL ||
    env.VITE_OPENAI_BASE_URL ||
    'https://api.hunyuan.cloud.tencent.com/v1';
  const model = env.HUNYUAN_MODEL || env.OPENAI_MODEL || env.VITE_OPENAI_MODEL || 'hunyuan-turbos-latest';

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
  };
}

function getNpcStyle(name: string): string {
  if (name.includes('花木兰')) {
    return [
      '你是花木兰，长城守卫军统帅。',
      '说话简洁、果断，以守城与补给优先。',
      '避免空话，不要跳出角色身份。',
    ].join('\n');
  }
  if (name.includes('铠')) {
    return [
      '你是铠，前线重装战士。',
      '你关注玩家站位、生存和撤离时机。',
      '语气冷静直接，优先给实战判断。',
    ].join('\n');
  }
  return [
    '你是百里玄策，外线侦察联络手。',
    '你关注路线、敌情变化和补给点状态。',
    '语气敏捷，但避免油滑和夸张。',
  ].join('\n');
}

function buildSystemPrompt(payload: DialoguePayload): string {
  const displayName = payload.profile?.displayName || '长城守卫军队友';
  const objectiveCollected = Math.max(0, payload.objectiveCollected ?? 0);
  const objectiveNeed = Math.max(0, payload.objectiveNeed ?? 0);
  const pressure = Math.max(0, Math.round(payload.pressure ?? 0));
  const phaseInstruction =
    objectiveCollected >= objectiveNeed
      ? '关键补给已达标，强调撤离与保命。'
      : '关键补给未达标，强调效率与优先级。';

  return [
    `你现在扮演：${displayName}`,
    getNpcStyle(displayName),
    payload.profile?.description ? `角色职责：${payload.profile.description}` : '',
    payload.persona ? `补充人设：${payload.persona}` : '',
    payload.memory ? `与玩家的历史记忆：\n${payload.memory}` : '',
    `剧情背景：\n${LORE_CONTEXT}`,
    phaseInstruction,
    '你必须保持角色内对话，不要解释模型或系统。',
    '回复用 2-5 句中文短句，先回答问题，再给战术建议。',
    `当前任务进度：${objectiveCollected}/${objectiveNeed}`,
    `当前压力值：${pressure}/100`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUserPrompt(payload: DialoguePayload): string {
  const history = (payload.history ?? [])
    .slice(-10)
    .map((entry) => `${entry.speaker}: ${entry.content}`)
    .join('\n');

  return [
    '当前战况：',
    `战术提示：${payload.tacticalHint || '暂无'}`,
    `压力值：${Math.max(0, Math.round(payload.pressure ?? 0))}/100`,
    `任务进度：${Math.max(0, payload.objectiveCollected ?? 0)}/${Math.max(0, payload.objectiveNeed ?? 0)}`,
    history ? `最近对话：\n${history}` : '最近对话：暂无',
    `玩家刚说：\n${payload.playerMessage || ''}`,
  ].join('\n');
}

async function createNpcDialogueHandler(body: string, env: Record<string, string>) {
  const payload = JSON.parse(body) as DialoguePayload;
  const { apiKey, baseUrl, model } = getApiConfig(env);

  if (!apiKey) {
    return { status: 500, body: { error: 'Missing HUNYUAN_API_KEY or OPENAI_API_KEY' } };
  }

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.92,
      top_p: 0.9,
      messages: [
        { role: 'system', content: buildSystemPrompt(payload) },
        { role: 'user', content: buildUserPrompt(payload) },
      ],
    }),
  });

  if (!upstream.ok) {
    const data = (await upstream.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return {
      status: upstream.status,
      body: {
        error: data.error?.message || data.message || 'Hunyuan request failed',
      },
    };
  }

  return {
    status: 200,
    body: upstream.body,
  };
}

type MiddlewareServer = {
  use: (
    handler: (
      req: any,
      res: any,
      next: () => void,
    ) => void | Promise<void>,
  ) => void;
};

async function pipeStreamingChat(upstreamBody: ReadableStream<Uint8Array>, res: any) {
  const decoder = new TextDecoder();
  const reader = upstreamBody.getReader();
  let buffer = '';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;

      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
          }>;
        };
        const content =
          json.choices?.[0]?.delta?.content ??
          json.choices?.[0]?.message?.content ??
          '';

        if (content) {
          res.write(content);
        }
      } catch {
        // Ignore malformed partial lines from upstream.
      }
    }
  }

  if (buffer.trim().startsWith('data:')) {
    const payload = buffer.trim().slice(5).trim();
    if (payload && payload !== '[DONE]') {
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
          }>;
        };
        const content =
          json.choices?.[0]?.delta?.content ??
          json.choices?.[0]?.message?.content ??
          '';
        if (content) {
          res.write(content);
        }
      } catch {
        // Ignore malformed trailing payloads.
      }
    }
  }

  res.end();
}

function installNpcDialogueProxy(middlewares: MiddlewareServer, env: Record<string, string>) {
  middlewares.use(async (req, res, next) => {
    if (req.url !== '/api/npc-dialogue') {
      next();
      return;
    }

    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    try {
      const body = await new Promise<string>((resolveBody, reject) => {
        let raw = '';
        req.on('data', (chunk) => {
          raw += String(chunk);
        });
        req.on('end', () => resolveBody(raw));
        req.on('error', reject);
      });

      const result = await createNpcDialogueHandler(body, env);

      if (result.status !== 200 || !(result.body instanceof ReadableStream)) {
        res.statusCode = result.status;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(result.body));
        return;
      }

      await pipeStreamingChat(result.body, res);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Dialogue proxy failed',
        }),
      );
    }
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      strictPort: true,
    },
    plugins: [
      {
        name: 'npc-dialogue-proxy',
        configureServer(server) {
          installNpcDialogueProxy(server.middlewares as MiddlewareServer, env);
        },
        configurePreviewServer(server) {
          installNpcDialogueProxy(server.middlewares as MiddlewareServer, env);
        },
      },
    ],
  };
});
