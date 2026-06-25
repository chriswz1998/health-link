import express from 'express';
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGeminiRouter } from './geminiRoutes.js';
import { createDocumentRouter } from './documentRoutes.js';
import { createAgentRouter } from './agentRoutes.js';
import { createPipelineRouter } from './pipelineRoutes.js';
import { createImportRouter } from './importRoutes.js';
import { createWechatRouter } from './wechatRoutes.js';
import { createCorsMiddleware } from './corsConfig.js';
import { getLlmStatus } from './llmProvider.js';
import { getRaccoonStatus } from './raccoonService.js';
import { isWechatConfigured } from './wechatAuth.js';

const isAzure =
    Boolean(process.env.WEBSITE_SITE_NAME) ||
    Boolean(process.env.WEBSITE_INSTANCE_ID) ||
    Boolean(process.env.WEBSITE_RESOURCE_GROUP);

if (!isAzure) {
  dotenv.config({ path: '.env.local' });
}

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST ?? '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

function getLanIPv4(): string[] {
  const ips: string[] = [];

  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  return ips;
}

app.use(createCorsMiddleware(isProd));
app.use(express.json({ limit: '15mb' }));

app.get('/api/lan-info', (_req, res) => {
  const ips = getLanIPv4();

  res.json({
    port: PORT,
    agentUrls: ips.map((ip) => `http://${ip}:${PORT}/agent`),
    homeUrls: ips.map((ip) => `http://${ip}:${PORT}/`),
    hint: '手机须与电脑同一 WiFi；生产模式通常用 3001 端口，本地开发前端通常用 3000 端口',
  });
});

app.get('/api/health', (_req, res) => {
  const llm = getLlmStatus();
  const raccoon = getRaccoonStatus();

  res.json({
    ok: true,
    environment: process.env.NODE_ENV ?? 'development',
    host: HOST,
    port: PORT,
    azure: isAzure,
    ragEnabled: process.env.RAG_ENABLED !== 'false',
    dashscopeConfigured: llm.dashscopeConfigured,
    hunyuanConfigured: llm.hunyuanConfigured,
    geminiConfigured: llm.geminiConfigured,
    raccoonConfigured: raccoon.configured,
    raccoonEnabled: raccoon.enabled,
    llmConfigured: llm.configured,
    llmProvider: llm.provider,
    llmModel: llm.model,
    llmLabel: llm.label,
    llmPreferred: llm.preferred,
    wechatConfigured: isWechatConfigured(),
  });
});

app.use('/api/import', createImportRouter());
app.use('/api/wechat', createWechatRouter());
app.use('/api/gemini', createGeminiRouter());
app.use('/api/document', createDocumentRouter());
app.use('/api/agent', createAgentRouter());
app.use('/api/pipeline', createPipelineRouter());

if (isProd) {
  const distPath = path.resolve(__dirname, '../dist');
  const indexPath = path.join(distPath, 'index.html');

  app.use(express.static(distPath));

  app.get('*', (_req, res) => {
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('Failed to serve frontend build:', err);
        res
            .status(500)
            .send(
                'Frontend build not found. Please run "npm run build" before starting the production server.',
            );
      }
    });
  });
}

app.listen(PORT, HOST, () => {
  console.log(`Health Link listening on ${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`Azure runtime: ${isAzure ? 'yes' : 'no'}`);

  if (!isProd) {
    for (const ip of getLanIPv4()) {
      console.log(`  手机访问 Agent → http://${ip}:${PORT}/agent`);
    }
  }

  const llm = getLlmStatus();
  const raccoon = getRaccoonStatus();

  if (!llm.configured) {
    console.warn(
        'Warning: No LLM configured. Set DASHSCOPE_API_KEY, HUNYUAN_API_KEY, or GEMINI_API_KEY.',
    );
  } else {
    console.log(`LLM active: ${llm.label} (${llm.model}) via LLM_PROVIDER=${llm.preferred}`);
  }

  if (raccoon.configured && raccoon.enabled) {
    console.log(`办公小浣熊: ${process.env.RACCOON_API_HOST ?? 'https://xiaohuanxiong.com'} (跨报告分析)`);
  }
});