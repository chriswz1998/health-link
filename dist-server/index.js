// server/index.ts
import express from "express";
import dotenv from "dotenv";
import os from "os";
import path2 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";

// server/geminiRoutes.ts
import { Router as Router2 } from "express";

// server/llmProvider.ts
import { GoogleGenAI, Type } from "@google/genai";
var PLACEHOLDER_PATTERNS = [
  /MY_/i,
  /^sk-\.\.\.$/,
  /^your[-_]/i,
  /^xxx$/i,
  /^sk-your-/i,
  /你的/i,
  /placeholder/i,
  /replace[-_]?me/i
];
function isConfiguredKey(key) {
  const trimmed = key?.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_PATTERNS.some((p) => p.test(trimmed));
}
function resolveHunyuanBaseUrl() {
  const configured = process.env.HUNYUAN_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "https://tokenhub.tencentmaas.com/v1";
}
function resolveHunyuanModel() {
  const configured = process.env.HUNYUAN_MODEL?.trim();
  const base = resolveHunyuanBaseUrl().toLowerCase();
  if (base.includes("tokenhub")) {
    if (!configured || configured === "hunyuan-turbos-latest") {
      return process.env.HUNYUAN_TOKENHUB_MODEL?.trim() || "hy3-preview";
    }
  }
  return configured || "hunyuan-turbos-latest";
}
function resolveSensenovaBaseUrl() {
  return (process.env.SENSENOVA_API_BASE ?? "https://token.sensenova.cn/v1").replace(/\/$/, "");
}
function resolveLlmConfigForProvider(provider) {
  if (provider === "dashscope" && isConfiguredKey(process.env.DASHSCOPE_API_KEY)) {
    return {
      provider,
      model: process.env.DASHSCOPE_CHAT_MODEL?.trim() || "qwen-plus",
      label: "\u963F\u91CC\u4E91\u767E\u70BC / \u901A\u4E49\u5343\u95EE"
    };
  }
  if (provider === "hunyuan" && isConfiguredKey(process.env.HUNYUAN_API_KEY)) {
    return {
      provider,
      model: resolveHunyuanModel(),
      label: "\u817E\u8BAF\u6DF7\u5143 / TokenHub"
    };
  }
  if (provider === "sensenova" && isConfiguredKey(process.env.SENSENOVA_API_KEY)) {
    return {
      provider,
      model: process.env.SENSENOVA_MODEL?.trim() || "sensenova-6.7-flash-lite",
      label: "\u5C0F\u6D63\u718A / SenseNova"
    };
  }
  if (provider === "gemini" && isConfiguredKey(process.env.GEMINI_API_KEY)) {
    return {
      provider,
      model: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",
      label: "Google Gemini"
    };
  }
  return null;
}
function listConfiguredLlmProviders() {
  const order = ["dashscope", "hunyuan", "gemini"];
  return order.map((p) => resolveLlmConfigForProvider(p)).filter((c) => c != null);
}
function resolveLlmConfig() {
  const preferred = process.env.LLM_PROVIDER?.trim().toLowerCase();
  const order = preferred === "sensenova" ? ["sensenova"] : preferred === "dashscope" ? ["dashscope"] : preferred === "hunyuan" ? ["hunyuan"] : preferred === "gemini" ? ["gemini"] : ["dashscope", "hunyuan", "gemini"];
  for (const provider of order) {
    const cfg = resolveLlmConfigForProvider(provider);
    if (cfg) return cfg;
  }
  return null;
}
function getLlmStatus() {
  const active = resolveLlmConfig();
  return {
    configured: active != null,
    provider: active?.provider ?? null,
    model: active?.model ?? null,
    label: active?.label ?? null,
    preferred: process.env.LLM_PROVIDER?.trim() || "auto",
    dashscopeConfigured: isConfiguredKey(process.env.DASHSCOPE_API_KEY),
    hunyuanConfigured: isConfiguredKey(process.env.HUNYUAN_API_KEY),
    geminiConfigured: isConfiguredKey(process.env.GEMINI_API_KEY),
    sensenovaConfigured: isConfiguredKey(process.env.SENSENOVA_API_KEY),
    configuredProviders: listConfiguredLlmProviders().map((c) => ({
      provider: c.provider,
      model: c.model,
      label: c.label
    }))
  };
}
function authHintFor401(providerLabel) {
  if (providerLabel.includes("\u767E\u70BC") || providerLabel.includes("\u901A\u4E49")) {
    return "\u8BF7\u68C0\u67E5 DASHSCOPE_API_KEY \u662F\u5426\u4E3A\u767E\u70BC\u63A7\u5236\u53F0\u7684\u6709\u6548\u5BC6\u94A5\uFF08https://dashscope.console.aliyun.com/\uFF09\uFF0C\u5E76\u786E\u8BA4\u5DF2\u5F00\u901A qwen-plus \u7B49\u6A21\u578B\u3002";
  }
  if (providerLabel.includes("\u6DF7\u5143")) {
    return "\u8BF7\u68C0\u67E5 TokenHub HUNYUAN_API_KEY \u662F\u5426\u6709\u6548\u3001\u662F\u5426\u5DF2\u5728\u63A7\u5236\u53F0\u300C\u5728\u7EBF\u63A8\u7406\u300D\u542F\u7528\u5BF9\u5E94\u6A21\u578B\uFF08\u5982 hy3-preview\uFF09\u3002";
  }
  if (providerLabel.includes("\u5C0F\u6D63\u718A") || providerLabel.includes("SenseNova")) {
    return "\u8BF7\u68C0\u67E5 SENSENOVA_API_KEY \u662F\u5426\u6709\u6548\uFF08https://console.sensenova.cn/\uFF09\uFF0C\u5E76\u786E\u8BA4\u6A21\u578B SenseChat-5 \u5DF2\u5F00\u901A\u3002";
  }
  return "\u8BF7\u68C0\u67E5 API Key \u662F\u5426\u6709\u6548\u3001\u662F\u5426\u5DF2\u5728\u5BF9\u5E94\u63A7\u5236\u53F0\u542F\u7528\u6A21\u578B\u3002";
}
async function openAiCompatibleJson(opts) {
  const res = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: "user", content: opts.prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      ...opts.useMaxCompletionTokens ? { max_completion_tokens: 4096 } : { max_tokens: 4096 }
    })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = payload.error?.message ?? `${opts.providerLabel} \u8BF7\u6C42\u5931\u8D25 (${res.status})`;
    if (res.status === 401) {
      throw new Error(`${detail} \u2014 ${authHintFor401(opts.providerLabel)}`);
    }
    throw new Error(detail);
  }
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${opts.providerLabel} \u8FD4\u56DE\u7A7A\u5185\u5BB9`);
  return parseLlmJsonContent(content);
}
function parseLlmJsonContent(raw) {
  let body = raw.trim();
  const fenced = body.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/i);
  if (fenced) body = fenced[1].trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(body.slice(start, end + 1));
    }
    throw new Error("LLM \u8FD4\u56DE\u7684\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u8BF7\u91CD\u8BD5");
  }
}
async function geminiJson(model, prompt, schema) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: schema
    }
  });
  const text = response.text;
  if (!text) throw new Error("Gemini \u8FD4\u56DE\u7A7A\u5185\u5BB9");
  return parseLlmJsonContent(text);
}
async function runProviderJson(config, prompt, schema) {
  if (config.provider === "dashscope") {
    return openAiCompatibleJson({
      baseUrl: process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: process.env.DASHSCOPE_API_KEY,
      model: config.model,
      prompt: `${prompt}

\u4E25\u683C\u8FD4\u56DE\u5408\u6CD5 JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981 markdown \u4EE3\u7801\u5757\u3002`,
      providerLabel: config.label
    });
  }
  if (config.provider === "hunyuan") {
    return openAiCompatibleJson({
      baseUrl: resolveHunyuanBaseUrl(),
      apiKey: process.env.HUNYUAN_API_KEY,
      model: config.model,
      prompt: `${prompt}

\u4E25\u683C\u8FD4\u56DE\u5408\u6CD5 JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981 markdown \u4EE3\u7801\u5757\u3002`,
      providerLabel: config.label
    });
  }
  if (config.provider === "sensenova") {
    return openAiCompatibleJson({
      baseUrl: resolveSensenovaBaseUrl(),
      apiKey: process.env.SENSENOVA_API_KEY,
      model: config.model,
      prompt: `${prompt}

\u4E25\u683C\u8FD4\u56DE\u5408\u6CD5 JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981 markdown \u4EE3\u7801\u5757\u3002`,
      providerLabel: config.label,
      useMaxCompletionTokens: true
    });
  }
  try {
    return await geminiJson(config.model, prompt, schema);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("fetch failed") || msg.includes("Connect Timeout")) {
      throw new Error(
        "Gemini \u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\uFF08\u56FD\u5185\u5E38\u89C1\uFF09\u3002\u8BF7\u6539\u7528 LLM_PROVIDER=sensenova\u3001dashscope \u6216 hunyuan\u3002"
      );
    }
    throw err;
  }
}
async function generateStructuredJsonAll(prompt, schema) {
  const providers = listConfiguredLlmProviders();
  if (!providers.length) {
    throw new Error(
      "\u672A\u914D\u7F6E\u53EF\u7528 LLM\u3002\u8BF7\u5728 .env.local \u8BBE\u7F6E SENSENOVA_API_KEY\u3001DASHSCOPE_API_KEY\u3001HUNYUAN_API_KEY \u6216 GEMINI_API_KEY\u3002"
    );
  }
  const results = await Promise.all(
    providers.map(async (config) => {
      try {
        const data = await runProviderJson(config, prompt, schema);
        return { data, config };
      } catch (err) {
        return {
          data: {},
          config,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    })
  );
  return results;
}
async function generateStructuredJson(prompt, schema) {
  const providers = listConfiguredLlmProviders();
  if (!providers.length) {
    throw new Error(
      "\u672A\u914D\u7F6E\u53EF\u7528 LLM\u3002\u8BF7\u5728 .env.local \u8BBE\u7F6E SENSENOVA_API_KEY\uFF08\u5C0F\u6D63\u718A\uFF09\u3001DASHSCOPE_API_KEY\uFF08\u767E\u70BC\uFF09\u3001HUNYUAN_API_KEY\uFF08\u6DF7\u5143\uFF09\u6216 GEMINI_API_KEY\u3002"
    );
  }
  let lastError;
  for (const config of providers) {
    try {
      const data = await runProviderJson(config, prompt, schema);
      return { data, config };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const msg = lastError.message;
      const authOrQuota = msg.includes("401") || msg.includes("403") || msg.includes("Forbidden") || msg.includes("\u65E0\u6548") || msg.includes("Incorrect API key");
      if (authOrQuota && providers.indexOf(config) < providers.length - 1) {
        console.warn(`[llm] ${config.label} \u4E0D\u53EF\u7528\uFF0C\u5C1D\u8BD5\u4E0B\u4E00\u63D0\u4F9B\u5546: ${msg.slice(0, 120)}`);
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error("\u6240\u6709\u5DF2\u914D\u7F6E\u7684 LLM \u5747\u8C03\u7528\u5931\u8D25");
}
var TRANSLATE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    familyExplanation: { type: Type.STRING },
    actionableSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
    severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
    nature: { type: Type.STRING, enum: ["transient", "persistent"] },
    natureExplanation: { type: Type.STRING },
    abnormalReason: { type: Type.STRING }
  },
  required: ["title", "familyExplanation", "actionableSteps", "severity", "nature", "natureExplanation", "abnormalReason"]
};
var RECONCILE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    medicalNecessity: { type: Type.STRING },
    userConstraint: { type: Type.STRING },
    reconciledStrategy: { type: Type.STRING },
    quantifiableMetrics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          target: { type: Type.STRING },
          unit: { type: Type.STRING }
        },
        required: ["label", "target", "unit"]
      }
    }
  },
  required: ["medicalNecessity", "userConstraint", "reconciledStrategy", "quantifiableMetrics"]
};
var RAG_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    summary: { type: Type.STRING },
    familyExplanation: { type: Type.STRING },
    actionableSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
    severity: { type: Type.STRING, enum: ["low", "medium", "high"] },
    nature: { type: Type.STRING, enum: ["transient", "persistent"] },
    natureExplanation: { type: Type.STRING },
    abnormalReason: { type: Type.STRING },
    citations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          chunkId: { type: Type.STRING },
          title: { type: Type.STRING },
          excerpt: { type: Type.STRING }
        },
        required: ["chunkId", "title"]
      }
    },
    careLevel: { type: Type.STRING },
    disclaimer: { type: Type.STRING }
  },
  required: [
    "title",
    "summary",
    "familyExplanation",
    "actionableSteps",
    "severity",
    "nature",
    "natureExplanation",
    "abnormalReason",
    "citations",
    "careLevel",
    "disclaimer"
  ]
};

// src/lib/l6OutputFilter.ts
var REPLACEMENT = "\uFF08\u8BE5\u8868\u8FF0\u9700\u7531\u533B\u751F\u5F53\u9762\u8BC4\u4F30\uFF0C\u6B64\u5904\u4E0D\u4F5C\u8BCA\u65AD\u6027\u7ED3\u8BBA\uFF09";
var BLOCK_PATTERNS = [
  { pattern: /你(?:已经|可能)?患有[\u4e00-\u9fa5A-Za-z0-9（）()]+/g, label: "diagnosis" },
  { pattern: /确诊为[\u4e00-\u9fa5A-Za-z0-9（）()]+/g, label: "diagnosis" },
  { pattern: /可以(?:基本)?排除[\u4e00-\u9fa5A-Za-z0-9（）()]+/g, label: "diagnosis" },
  { pattern: /必须(?:立即)?(?:服用|使用|注射)[\u4e00-\u9fa5A-Za-z0-9（）()]+/g, label: "prescription" },
  { pattern: /建议(?:你)?(?:立即)?(?:停用|停止服用)[\u4e00-\u9fa5A-Za-z0-9（）()]+/g, label: "prescription" },
  { pattern: /(?:每天|每日)(?:服用|口服)[\u4e00-\u9fa5A-Za-z0-9（）()·\d]+(?:mg|毫克|片|粒|单位)/gi, label: "prescription" },
  { pattern: /保证(?:你)?(?:没有|无)[\u4e00-\u9fa5A-Za-z0-9（）()]+/g, label: "guarantee" }
];
function sanitizeLlmHealthText(text) {
  if (!text?.trim()) return { text: text ?? "", filtered: false, hits: [] };
  let out = text;
  const hits = [];
  for (const { pattern, label } of BLOCK_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(out)) {
      hits.push(label);
      pattern.lastIndex = 0;
      out = out.replace(pattern, REPLACEMENT);
    }
  }
  return { text: out, filtered: hits.length > 0, hits };
}
function sanitizeStringFields(obj, keys) {
  let filtered = false;
  const next = { ...obj };
  for (const key of keys) {
    const v = next[key];
    if (typeof v === "string") {
      const r = sanitizeLlmHealthText(v);
      next[key] = r.text;
      filtered = filtered || r.filtered;
    } else if (Array.isArray(v) && key === "lifestyleTips") {
      next[key] = v.map((item) => {
        if (typeof item !== "string") return item;
        const r = sanitizeLlmHealthText(item);
        filtered = filtered || r.filtered;
        return r.text;
      });
    } else if (Array.isArray(v) && key === "actionableSteps") {
      next[key] = v.map((item) => {
        if (typeof item !== "string") return item;
        const r = sanitizeLlmHealthText(item);
        filtered = filtered || r.filtered;
        return r.text;
      });
    }
  }
  return { value: next, filtered };
}

// server/knowledgeUtils.ts
function filterCitations(raw, allowedIds) {
  if (!Array.isArray(raw) || allowedIds.length === 0) return [];
  const allowed = new Set(allowedIds);
  return raw.filter(
    (c) => typeof c === "object" && c != null && typeof c.chunkId === "string" && typeof c.title === "string" && allowed.has(c.chunkId)
  ).map((c) => {
    const excerpt = typeof c.excerpt === "string" ? sanitizeLlmHealthText(c.excerpt).text : void 0;
    return {
      chunkId: c.chunkId,
      title: sanitizeLlmHealthText(c.title).text,
      excerpt
    };
  });
}
function sanitizeSummaryPayload(data) {
  const { value, filtered } = sanitizeStringFields(data, [
    "summary",
    "headline",
    "followUpHint",
    "familyExplanation",
    "title",
    "natureExplanation",
    "abnormalReason"
  ]);
  if (filtered) {
    value.l6Filtered = true;
  }
  return value;
}
function sanitizeItemPayload(data) {
  const { value, filtered } = sanitizeStringFields(data, [
    "plainExplanation",
    "whyAbnormal",
    "lifestyleTips"
  ]);
  if (filtered) {
    value.l6Filtered = true;
  }
  return value;
}
function sanitizeChatReply(reply) {
  const r = sanitizeLlmHealthText(reply);
  return { reply: r.text, l6Filtered: r.filtered };
}

// server/importRoutes.ts
import { Router } from "express";

// server/prompts/examImportPrompts.ts
var VISION_EXTRACT_PROMPT = `\u4F60\u662F Health Link \u4F53\u68C0\u62A5\u544A\u7ED3\u6784\u5316\u63D0\u53D6\u52A9\u624B\uFF08\u9636\u6BB5 1 \xB7 \u767E\u70BC\u89C6\u89C9/OCR\uFF09\u3002

\u4EFB\u52A1\uFF1A\u4ECE\u56FE\u7247\u4E2D\u5B8C\u6574\u63D0\u53D6\u68C0\u9A8C\u9879\u76EE\uFF0C\u5C24\u5176\u4E0D\u8981\u9057\u6F0F\u5E26 \u2191\u2193 \u6216\u300C\u9AD8/\u4F4E/\u5F02\u5E38\u300D\u6807\u8BB0\u7684\u9879\u76EE\u3002

\u8F93\u51FA\u8981\u6C42\uFF08\u4E25\u683C JSON\uFF0C\u4E0D\u8981 markdown\uFF09\uFF1A
{
  "reportDate": "YYYY-MM-DD \u6216 null",
  "hospital": "\u673A\u6784\u540D\u79F0\u6216 null",
  "patientHint": "\u59D3\u540D/\u6027\u522B/\u5E74\u9F84\u6458\u8981\u6216 null",
  "items": [
    {
      "name": "\u62A5\u544A\u539F\u6587\u540D\u79F0",
      "value": "\u7ED3\u679C\u503C",
      "unit": "\u5355\u4F4D",
      "referenceRange": "\u53C2\u8003\u8303\u56F4",
      "flag": "high|low|positive|critical|null"
    }
  ]
}

\u7EA6\u675F\uFF1A
- flag \u4EC5\u53D6 high\uFF08\u504F\u9AD8/\u2191\uFF09\u3001low\uFF08\u504F\u4F4E/\u2193\uFF09\u3001positive\uFF08\u9633\u6027/+\uFF09\u3001critical\uFF08\u5371\u6025\uFF09\u3001null\uFF08\u6B63\u5E38\uFF09
- \u4E0D\u5F97\u8BCA\u65AD\u3001\u4E0D\u5F97\u7ED9\u51FA\u6CBB\u7597\u5EFA\u8BAE
- \u65E0\u6CD5\u8BC6\u522B\u7684\u5B57\u6BB5\u586B null\uFF0C\u4E0D\u8981\u7F16\u9020`;
function buildBatchAnalysisPrompt(reportsSummary, abnormalSummary) {
  return `\u4F60\u662F Health Link \u5065\u5EB7\u7BA1\u7406\u6570\u636E\u5206\u6790\u52A9\u624B\uFF08\u9636\u6BB5 2 \xB7 LLM \u964D\u7EA7 \xB7 \u8DE8\u62A5\u544A\u8D8B\u52BF\u6458\u8981\uFF09\u3002

\u7528\u6237\u4E00\u6B21\u6027\u5BFC\u5165\u4E86\u591A\u4EFD\u4F53\u68C0\u62A5\u544A\uFF0C\u8BF7\u57FA\u4E8E\u7ED3\u6784\u5316\u6570\u636E\u505A\u8D8B\u52BF\u4E0E\u98CE\u9669\u6458\u8981\u3002

\u3010\u5404\u62A5\u544A\u6458\u8981\u3011
${reportsSummary}

\u3010\u5F02\u5E38\u9879\u6C47\u603B\u3011
${abnormalSummary}

\u8BF7\u7528\u7B80\u4F53\u4E2D\u6587\u8FD4\u56DE JSON\uFF1A
{
  "headline": "\u4E00\u53E5\u8BDD\u603B\u89C8\uFF0830\u5B57\u5185\uFF09",
  "overallSummary": "200\u5B57\u5185\u7EFC\u5408\u89E3\u8BFB\uFF0C\u9762\u5411\u672C\u4EBA\u4E0E\u5BB6\u4EBA",
  "improving": ["\u6539\u5584\u6216\u5411\u597D\u7684\u6307\u6807/\u7EF4\u5EA6"],
  "worsening": ["\u6076\u5316\u6216\u9700\u5173\u6CE8\u7684\u6307\u6807/\u7EF4\u5EA6"],
  "stable": ["\u57FA\u672C\u7A33\u5B9A\u7684\u6307\u6807"],
  "crossReportInsights": ["\u8DE8\u62A5\u544A\u5173\u8054\u6D1E\u5BDF\uFF0C\u5982\u4F53\u91CD\u4E0E\u8840\u8102\u8054\u52A8"],
  "suggestedQuestions": ["\u5EFA\u8BAE\u590D\u8BCA\u65F6\u95EE\u533B\u751F\u7684\u95EE\u9898\uFF0C3-5\u6761"],
  "chartHints": [
    { "metric": "\u6807\u51C6\u6307\u6807\u540D", "unit": "\u5355\u4F4D", "points": [{ "date": "YYYY-MM-DD", "value": \u6570\u5B57 }] }
  ],
  "disclaimer": "\u56FA\u5B9A\u514D\u8D23\u58F0\u660E\uFF1A\u975E\u533B\u7597\u8BCA\u65AD\uFF0C\u5F02\u5E38\u8BF7\u9075\u533B\u5631\u590D\u67E5"
}

\u786C\u6027\u7EA6\u675F\uFF1A
- \u4E0D\u5F97\u8BCA\u65AD\u75BE\u75C5\u3001\u4E0D\u5F97\u63A8\u8350\u5177\u4F53\u836F\u7269
- \u53EA\u80FD\u57FA\u4E8E\u7ED9\u5B9A\u6570\u636E\u63A8\u65AD\u8D8B\u52BF\uFF0C\u7F3A\u5931\u6570\u636E\u8BF7\u8BF4\u660E
- chartHints \u4EC5\u5305\u542B\u6709 numeric \u503C\u7684\u6307\u6807\uFF0C\u6700\u591A 5 \u6761`;
}
function buildRagInterpretPrompt(opts) {
  return `\u4F60\u662F Health Link \u5065\u5EB7\u7FFB\u8BD1\u52A9\u624B\uFF08\u9636\u6BB5 3 \xB7 \u5F02\u5E38\u9879 RAG \u4EBA\u8BDD\u89E3\u8BFB \xB7 LLM+\u77E5\u8BC6\u5E93\uFF09\u3002

\u786C\u6027\u7EA6\u675F\uFF08L6 \u5B89\u5168\u5C42\uFF09\uFF1A
- \u4E0D\u5F97\u8BCA\u65AD\u3001\u4E0D\u5F97\u5F00\u5904\u65B9\u3001\u4E0D\u5F97\u5EFA\u8BAE\u505C\u836F
- \u4F7F\u7528\u300C\u53EF\u80FD\u4E0E\u2026\u6709\u5173\u300D\u300C\u5EFA\u8BAE\u8FDB\u4E00\u6B65\u8BC4\u4F30\u300D\u7B49\u8868\u8FF0
- \u5FC5\u987B\u5728 citations \u4E2D\u5F15\u7528\u6240\u7528\u77E5\u8BC6\u7247\u6BB5 id\uFF08\u683C\u5F0F l2:... / l3:...\uFF09
- \u82E5 careLevel \u4E3A S4\uFF0C\u5FC5\u987B\u660E\u786E\u5EFA\u8BAE\u7ACB\u5373/\u6025\u8BCA\u5C31\u533B\uFF0C\u4F46\u4ECD\u4E0D\u5F97\u4E0B\u8BCA\u65AD

\u7167\u62A4\u7B49\u7EA7\uFF1A${opts.careLevel}
${opts.focusBlock}
\u7528\u6237\u6863\u6848\u89C2\u6D4B\uFF08\u8282\u9009\uFF09\uFF1A
${opts.obsSummary || "\uFF08\u65E0\u7ED3\u6784\u5316\u89C2\u6D4B\uFF09"}

\u89C4\u5219\u5F15\u64CE\u7EA2\u65D7\uFF08\u8282\u9009\uFF09\uFF1A
${opts.flagSummary || "\uFF08\u65E0\u89E6\u53D1\u89C4\u5219\uFF09"}

\u77E5\u8BC6\u5E93\u7247\u6BB5\uFF08\u4EC5\u53EF\u5F15\u7528\u4EE5\u4E0B\u5185\u5BB9\uFF0C\u52FF\u7F16\u9020\u6307\u5357\uFF09\uFF1A
---
${opts.knowledgeContext}
---

\u8BF7\u7528\u7B80\u4F53\u4E2D\u6587\u8FD4\u56DE JSON\uFF0C\u5305\u542B\u5B57\u6BB5\uFF1Atitle, summary, familyExplanation, actionableSteps (string[]), severity (low|medium|high), nature (transient|persistent), natureExplanation, abnormalReason, citations ([{chunkId,title,excerpt}]), careLevel, disclaimer\u3002`;
}

// server/raccoonService.ts
import { randomUUID } from "crypto";

// server/exportReportsCsv.ts
var CSV_HEADERS = [
  "report_date",
  "hospital",
  "source_file",
  "standard_name",
  "canonical_id",
  "value",
  "unit",
  "reference_min",
  "reference_max",
  "reference_range_raw",
  "is_abnormal",
  "abnormal_type"
];
function csvEscape(value) {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function buildReportsCsv(reports) {
  const okReports = reports.filter((r) => r.ok !== false);
  if (!okReports.length) throw new Error("\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u6709\u6548\u62A5\u544A");
  const rows = [CSV_HEADERS.join(",")];
  for (const report of okReports) {
    const reportDate = report.report_date ?? report.reportDate ?? "";
    const hospital = report.hospital ?? "";
    const sourceFile = report.source_file ?? report.fileName ?? "";
    const indicators = report.indicators ?? [];
    for (const ind of indicators) {
      rows.push(
        [
          reportDate,
          hospital,
          sourceFile,
          ind.standard_name ?? "",
          ind.canonical_id ?? "",
          ind.value ?? "",
          ind.unit ?? "",
          ind.reference_min ?? "",
          ind.reference_max ?? "",
          ind.reference_range_raw ?? "",
          ind.is_abnormal ? "true" : "false",
          ind.abnormal_type ?? ""
        ].map(csvEscape).join(",")
      );
    }
  }
  return `\uFEFF${rows.join("\n")}`;
}

// server/raccoonService.ts
var HEALTH_ANALYSIS_PROMPT = `\u4F60\u662F\u4E00\u540D\u5065\u5EB7\u6570\u636E\u5206\u6790\u5E08\u3002\u8BF7\u57FA\u4E8E\u4E0A\u4F20\u7684 CSV \u4F53\u68C0\u6307\u6807\u8868\u8FDB\u884C\u5206\u6790\u3002

\u8981\u6C42\uFF1A
1. \u82E5\u6709\u591A\u4EFD\u62A5\u544A\uFF08\u4E0D\u540C report_date\uFF09\uFF0C\u5BF9\u6BD4\u540C\u4E00 canonical_id / standard_name \u7684\u6570\u503C\u53D8\u5316\u8D8B\u52BF
2. \u91CD\u70B9\u5217\u51FA is_abnormal=true \u7684\u6307\u6807\uFF0C\u8BF4\u660E\u662F\u504F\u9AD8\u8FD8\u662F\u504F\u4F4E
3. \u7528\u901A\u4FD7\u4E2D\u6587\u603B\u7ED3\uFF0C\u4E0D\u8981\u7ED9\u51FA\u5177\u4F53\u7528\u836F\u6216\u8BCA\u65AD\u7ED3\u8BBA
4. \u5C3D\u91CF\u751F\u6210 1-2 \u5F20\u53EF\u89C6\u5316\u56FE\u8868\uFF08\u8D8B\u52BF\u6298\u7EBF\u56FE\u3001\u5F02\u5E38\u9879\u5BF9\u6BD4\u56FE\u7B49\uFF09
5. \u5982\u6709\u6761\u4EF6\uFF0C\u8F93\u51FA\u53EF\u4E0B\u8F7D\u7684\u5206\u6790\u62A5\u544A\uFF08PPT \u6216\u6587\u6863\uFF09
6. \u8F93\u51FA\u7ED3\u6784\uFF1A\u5148\u7ED9 3-5 \u6761\u8981\u70B9\uFF0C\u518D\u7ED9\u8BE6\u7EC6\u5206\u6790

\u6570\u636E\u5B57\u6BB5\u8BF4\u660E\uFF1Areport_date=\u4F53\u68C0\u65E5\u671F, standard_name=\u6307\u6807\u540D, value=\u6570\u503C, is_abnormal=\u662F\u5426\u5F02\u5E38`;
var RaccoonAPIError = class extends Error {
  constructor(code, message) {
    super(`\u529E\u516C\u5C0F\u6D63\u718A API \u9519\u8BEF [${code}]: ${message}`);
    this.code = code;
  }
};
function raccoonHost() {
  return (process.env.RACCOON_API_HOST ?? "https://xiaohuanxiong.com").replace(/\/$/, "");
}
function raccoonToken() {
  return process.env.RACCOON_API_TOKEN?.trim() ?? "";
}
function isRaccoonConfigured() {
  const token = raccoonToken();
  if (!token) return false;
  const PLACEHOLDER = [/你的/i, /placeholder/i, /replace[-_]?me/i, /^xxx$/i];
  return !PLACEHOLDER.some((p) => p.test(token));
}
function getRaccoonStatus() {
  return {
    configured: isRaccoonConfigured(),
    host: raccoonHost(),
    enabled: process.env.ENABLE_RACCOON_ANALYSIS !== "false"
  };
}
var RaccoonClient = class {
  constructor() {
    this.host = raccoonHost();
    this.token = raccoonToken();
  }
  jsonHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`
    };
  }
  uploadHeaders() {
    return { Authorization: `Bearer ${this.token}` };
  }
  async request(method, path3, body) {
    const res = await fetch(`${this.host}${path3}`, {
      method,
      headers: this.jsonHeaders(),
      body: body != null ? JSON.stringify(body) : void 0
    });
    const text = await res.text();
    if (!res.ok) throw new RaccoonAPIError(res.status, text.slice(0, 300));
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new RaccoonAPIError(res.status, text.slice(0, 300));
    }
    if (parsed.code !== 0) {
      throw new RaccoonAPIError(parsed.code ?? "unknown", parsed.message ?? "unknown error");
    }
    return parsed.data ?? {};
  }
  async createSession(name) {
    return this.request("POST", "/api/open/office/v2/sessions", { name });
  }
  async uploadCsv(csvContent, filename = "health_reports.csv") {
    const batchId = randomUUID();
    const url = `${this.host}/api/open/office/v2/sessions/default_session/${batchId}/files`;
    const form = new FormData();
    form.append("file", new Blob([csvContent], { type: "text/csv" }), filename);
    const res = await fetch(url, {
      method: "POST",
      headers: this.uploadHeaders(),
      body: form
    });
    const text = await res.text();
    if (!res.ok) throw new RaccoonAPIError(res.status, text.slice(0, 300));
    const body = JSON.parse(text);
    const fileId = body.data?.file_list?.[0]?.id;
    if (fileId == null) throw new RaccoonAPIError(0, "\u4E0A\u4F20\u6587\u4EF6\u5931\u8D25: \u8FD4\u56DE\u7A7A file_list");
    return fileId;
  }
  async chat(sessionId, content, uploadFileIds) {
    const url = `${this.host}/api/open/office/v2/sessions/${sessionId}/chat/conversations`;
    const payload = {
      content,
      verbose: true,
      enable_web_search: false,
      deep_think: false,
      temperature: 0.7,
      message_uuid: randomUUID(),
      edit: 0
    };
    if (uploadFileIds?.length) payload.upload_file_id = uploadFileIds;
    const res = await fetch(url, {
      method: "POST",
      headers: this.jsonHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new RaccoonAPIError(res.status, errText.slice(0, 300));
    }
    let text = "";
    const images = [];
    let imageBuffer = "";
    let currentStage = "";
    let outSessionId = sessionId;
    let turnId = "";
    const reader = res.body?.getReader();
    if (!reader) throw new RaccoonAPIError(0, "\u529E\u516C\u5C0F\u6D63\u718A\u8FD4\u56DE\u7A7A\u54CD\u5E94\u6D41");
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const jsonStr = line.slice(5).trim();
        if (jsonStr === "[DONE]") break;
        let obj;
        try {
          obj = JSON.parse(jsonStr);
        } catch {
          continue;
        }
        const statusCode = obj.status?.code ?? 0;
        if (statusCode !== 0) {
          throw new RaccoonAPIError(statusCode, obj.status?.message ?? "stream error");
        }
        const stage = obj.stage ?? "";
        const delta = obj.data?.delta ?? "";
        if (obj.data?.session_id) outSessionId = obj.data.session_id;
        if (obj.data?.turn_id) turnId = obj.data.turn_id;
        if (!delta) continue;
        if (stage && stage !== currentStage) {
          if (currentStage === "image" && imageBuffer) {
            images.push(imageBuffer);
            imageBuffer = "";
          }
          currentStage = stage;
        }
        if (currentStage === "generate") text += delta;
        else if (currentStage === "image") imageBuffer += delta;
      }
    }
    if (imageBuffer) images.push(imageBuffer);
    return { text, images, sessionId: outSessionId, turnId };
  }
  async getArtifacts(sessionId) {
    const data = await this.request(
      "GET",
      `/api/open/office/v2/sessions/${sessionId}/artifacts`
    );
    return (data.artifacts ?? []).filter((a) => a.s3_url).map((a) => ({
      filename: a.filename ?? `artifact_${a.timestamp ?? "unknown"}`,
      url: a.s3_url,
      timestamp: a.timestamp
    }));
  }
};
function buildPrompt(reports, memberName) {
  const dates = [...new Set(reports.map((r) => r.report_date ?? r.reportDate ?? "").filter(Boolean))].sort();
  const abnormalTotal = reports.reduce(
    (sum, r) => sum + (r.indicators?.filter((i) => i.is_abnormal).length ?? 0),
    0
  );
  let header = `\u6210\u5458: ${memberName || "\u672A\u547D\u540D"}
\u62A5\u544A\u4EFD\u6570: ${reports.length}
`;
  header += `\u65E5\u671F\u8303\u56F4: ${dates.join(", ")}
\u5F02\u5E38\u6307\u6807\u603B\u6570: ${abnormalTotal}

`;
  return header + HEALTH_ANALYSIS_PROMPT;
}
function headlineFromText(text) {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean);
  return line ? line.replace(/^[-*#\d.\s]+/, "").slice(0, 80) : "\u8DE8\u62A5\u544A\u5065\u5EB7\u6570\u636E\u5206\u6790";
}
async function analyzeHealthReportsWithRaccoon(opts) {
  if (!isRaccoonConfigured()) {
    return { ok: false, error: "\u672A\u914D\u7F6E RACCOON_API_HOST / RACCOON_API_TOKEN", source: "raccoon" };
  }
  const okReports = opts.reports.filter((r) => r.ok !== false);
  if (!okReports.length) {
    return { ok: false, error: "\u6CA1\u6709\u6709\u6548\u62A5\u544A\u53EF\u5206\u6790", source: "raccoon" };
  }
  try {
    const client = new RaccoonClient();
    const csv = buildReportsCsv(okReports);
    const sessionName = `HealthLink-${opts.memberName || "\u7528\u6237"}-${okReports.length}\u4EFD`;
    const session = await client.createSession(sessionName);
    const fileId = await client.uploadCsv(csv);
    const prompt = buildPrompt(okReports, opts.memberName);
    const chat = await client.chat(session.id, prompt, [fileId]);
    const artifacts = await client.getArtifacts(chat.sessionId);
    const analysisText = chat.text.trim();
    return {
      ok: true,
      source: "raccoon",
      sessionId: chat.sessionId,
      text: analysisText,
      images: chat.images,
      artifacts,
      reportCount: okReports.length
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[raccoon/analyze]", msg);
    return { ok: false, error: msg, source: "raccoon" };
  }
}
function mapRaccoonToBatchAnalysis(result) {
  const text = result.text ?? "";
  const bulletLines = text.split("\n").map((l) => l.trim()).filter((l) => /^[-*•\d]/.test(l)).map((l) => l.replace(/^[-*•\d.\s]+/, "")).filter(Boolean);
  return {
    headline: headlineFromText(text),
    overallSummary: text,
    crossReportInsights: bulletLines.slice(0, 8),
    suggestedQuestions: [],
    disclaimer: "\u672C\u5206\u6790\u7531\u529E\u516C\u5C0F\u6D63\u718A\u751F\u6210\uFF0C\u4EC5\u4F9B\u5065\u5EB7\u7BA1\u7406\u53C2\u8003\uFF0C\u4E0D\u80FD\u66FF\u4EE3\u533B\u751F\u9762\u8BCA\u4E0E\u8BCA\u65AD\u3002",
    source: "raccoon",
    provider: "raccoon",
    label: "\u529E\u516C\u5C0F\u6D63\u718A / OpenClaw",
    raccoonSessionId: result.sessionId,
    analysisText: text,
    images: result.images ?? [],
    artifacts: result.artifacts ?? []
  };
}

// server/importRoutes.ts
var BATCH_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    overallSummary: { type: "string" },
    improving: { type: "array", items: { type: "string" } },
    worsening: { type: "array", items: { type: "string" } },
    stable: { type: "array", items: { type: "string" } },
    crossReportInsights: { type: "array", items: { type: "string" } },
    suggestedQuestions: { type: "array", items: { type: "string" } },
    chartHints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          metric: { type: "string" },
          unit: { type: "string" },
          points: {
            type: "array",
            items: {
              type: "object",
              properties: { date: { type: "string" }, value: { type: "number" } }
            }
          }
        }
      }
    },
    disclaimer: { type: "string" }
  },
  required: ["headline", "overallSummary", "disclaimer"]
};
function requireAnalysisBackend(_req, res, next) {
  if (!isRaccoonConfigured() && !getLlmStatus().configured) {
    res.status(503).json({
      message: "\u672A\u914D\u7F6E\u8DE8\u62A5\u544A\u5206\u6790\u540E\u7AEF\u3002\u8BF7\u8BBE\u7F6E RACCOON_API_TOKEN\uFF08\u529E\u516C\u5C0F\u6D63\u718A\uFF09\u6216 DASHSCOPE_API_KEY / HUNYUAN_API_KEY\uFF08LLM \u964D\u7EA7\uFF09\u3002"
    });
    return;
  }
  next();
}
async function llmBatchFallback(reports) {
  const reportsSummary = reports.map(
    (r) => `- ${r.fileName} (${r.reportDate})\uFF1A${r.observationCount} \u9879\uFF0C${r.abnormalCount} \u9879\u5F02\u5E38${r.topAbnormal?.length ? ` \xB7 ${r.topAbnormal.join("\u3001")}` : ""}`
  ).join("\n");
  const abnormalSummary = reports.flatMap((r) => r.topAbnormal ?? []).filter(Boolean).join("\u3001");
  const prompt = buildBatchAnalysisPrompt(reportsSummary, abnormalSummary || "\uFF08\u65E0\u663E\u8457\u5F02\u5E38\uFF09");
  const { data, config } = await generateStructuredJson(prompt, BATCH_SCHEMA);
  return {
    ...data,
    source: "llm",
    provider: config.provider,
    model: config.model,
    label: config.label
  };
}
function createImportRouter() {
  const router = Router();
  router.get("/raccoon-status", (_req, res) => {
    res.json(getRaccoonStatus());
  });
  router.post("/batch-analyze", requireAnalysisBackend, async (req, res) => {
    try {
      const { reports = [], memberName = "" } = req.body;
      if (!reports.length) {
        res.status(400).json({ message: "reports \u4E0D\u80FD\u4E3A\u7A7A" });
        return;
      }
      const okReports = reports.filter((r) => r.ok !== false);
      const hasIndicators = okReports.some((r) => (r.indicators?.length ?? 0) > 0);
      const raccoonEnabled = process.env.ENABLE_RACCOON_ANALYSIS !== "false" && isRaccoonConfigured();
      if (raccoonEnabled && hasIndicators) {
        const raccoon = await analyzeHealthReportsWithRaccoon({ reports, memberName });
        if (raccoon.ok) {
          res.json(mapRaccoonToBatchAnalysis(raccoon));
          return;
        }
        console.warn("[import/batch-analyze] raccoon failed, fallback LLM:", raccoon.error);
      }
      if (!getLlmStatus().configured) {
        res.status(503).json({
          message: raccoonEnabled && !hasIndicators ? "\u62A5\u544A\u7F3A\u5C11\u7ED3\u6784\u5316\u6307\u6807\uFF0C\u65E0\u6CD5\u8C03\u7528\u529E\u516C\u5C0F\u6D63\u718A\u3002\u8BF7\u786E\u8BA4\u5BFC\u5165\u6210\u529F\u540E\u518D\u8BD5\u3002" : "\u529E\u516C\u5C0F\u6D63\u718A\u5206\u6790\u5931\u8D25\u4E14\u672A\u914D\u7F6E LLM \u964D\u7EA7\u3002\u8BF7\u68C0\u67E5 RACCOON_API_TOKEN \u6216 DASHSCOPE_API_KEY\u3002"
        });
        return;
      }
      const summaryReports = okReports.map((r) => ({
        fileName: r.fileName ?? r.source_file ?? "report",
        reportDate: r.reportDate ?? r.report_date ?? "",
        observationCount: r.indicators?.length ?? 0,
        abnormalCount: r.indicators?.filter((i) => i.is_abnormal).length ?? 0,
        topAbnormal: (r.indicators ?? []).filter((i) => i.is_abnormal).slice(0, 5).map((i) => i.standard_name)
      }));
      const payload = await llmBatchFallback(summaryReports);
      res.json(payload);
    } catch (error) {
      console.error("[import/batch-analyze]", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Batch analyze failed." });
    }
  });
  return router;
}
function buildRagPromptBody(body) {
  const obsSummary = (body.observations ?? []).slice(0, 20).map(
    (o) => `- ${o.standardName}${o.value != null ? `: ${o.value}${o.unit ? ` ${o.unit}` : ""}` : ""}${o.abnormalFlag ? ` [${o.abnormalFlag}]` : ""}${o.reportDate ? ` (${o.reportDate})` : ""}`
  ).join("\n");
  const flagSummary = (body.redFlags ?? []).slice(0, 10).map((f) => `- [${f.severity}] ${f.title}: ${f.message}`).join("\n");
  const focusBlock = body.medicalTerm && body.value ? `
\u7528\u6237\u5F53\u524D\u5173\u6CE8\u6307\u6807\uFF1A${body.medicalTerm} = ${body.value}
` : "";
  return buildRagInterpretPrompt({
    careLevel: body.careLevel ?? "S1",
    focusBlock,
    obsSummary,
    flagSummary,
    knowledgeContext: body.knowledgeContext ?? ""
  });
}
function normalizeRagPayload(data, careLevel) {
  const steps = data.actionableSteps;
  if (typeof steps === "string") {
    data.actionableSteps = [steps];
  } else if (!Array.isArray(steps)) {
    data.actionableSteps = [];
  }
  if (!Array.isArray(data.citations)) data.citations = [];
  if (typeof data.careLevel !== "string" || !data.careLevel) {
    data.careLevel = careLevel ?? "S1";
  }
  if (typeof data.summary !== "string") {
    data.summary = typeof data.title === "string" ? data.title : "";
  }
  if (typeof data.disclaimer !== "string") {
    data.disclaimer = "\u672C\u89E3\u8BFB\u4EC5\u4F9B\u5065\u5EB7\u7BA1\u7406\u53C2\u8003\uFF0C\u4E0D\u80FD\u66FF\u4EE3\u533B\u751F\u9762\u8BCA\u3001\u8BCA\u65AD\u6216\u6CBB\u7597\u3002\u5982\u6709\u4E0D\u9002\u8BF7\u53CA\u65F6\u5C31\u533B\u3002";
  }
  return data;
}

// server/geminiRoutes.ts
function requireLlm(_req, res, next) {
  if (!getLlmStatus().configured) {
    res.status(503).json({
      message: "\u672A\u914D\u7F6E\u53EF\u7528 LLM\u3002\u8BF7\u5728 .env.local \u8BBE\u7F6E DASHSCOPE_API_KEY\uFF08\u767E\u70BC Qwen\uFF09\u3001HUNYUAN_API_KEY\uFF08\u817E\u8BAF\u6DF7\u5143\uFF09\u6216 GEMINI_API_KEY\u3002"
    });
    return;
  }
  next();
}
function createGeminiRouter() {
  const router = Router2();
  router.get("/status", (_req, res) => {
    res.json(getLlmStatus());
  });
  router.use(requireLlm);
  router.post("/translate", async (req, res) => {
    try {
      const { medicalTerm, value } = req.body;
      if (!medicalTerm || !value) {
        res.status(400).json({ message: "medicalTerm and value are required." });
        return;
      }
      const prompt = `You are a professional, user-friendly medical interpreter.
  Translate the following medical test result into warm, plain spoken "family language" (\u8BF4\u4EBA\u8BDD) for a patient who is worried but doesn't want to go to the hospital unnecessarily.
  
  CRITICAL ASSESSMENT:
  Identify if this abnormality is likely:
  1. "transient" (\u4E00\u8FC7\u6027/\u6682\u65F6\u6027\u6CE2\u52A8): e.g., caused by short-term factors like eating too salty last night (\u6628\u665A\u5403\u54B8\u4E86), high-sodium meal, staying up late (\u71AC\u591C), dehydration, temporary stress, or intensive exercise. Let them know it's a transient trigger and how they can verify it.
  2. "persistent" (\u6301\u7EED\u6027/\u75C5\u7406\u6027\u7279\u5F81): e.g., structural, metabolic, chronic, or genetic deviation that requires formal clinical checkup (\u9700\u8981\u5B9A\u671F\u533B\u9662\u590D\u67E5).
  
  Provide realistic, honest evidence-based context.
  
  Medical Term: ${medicalTerm}
  Value: ${value}
  
  Return the result leading in Chinese (\u7B80\u4F53\u4E2D\u6587) in JSON format with keys: title, familyExplanation, actionableSteps (array of 3 strings), severity (low|medium|high), nature (transient|persistent), natureExplanation, abnormalReason.`;
      const { data, config } = await generateStructuredJson(prompt, TRANSLATE_SCHEMA);
      res.json({ ...data, provider: config.provider, model: config.model });
    } catch (error) {
      console.error("[gemini/translate]", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Translation failed." });
    }
  });
  router.post("/reconcile", async (req, res) => {
    try {
      const { medicalAdvise, userHabit } = req.body;
      if (!medicalAdvise || !userHabit) {
        res.status(400).json({ message: "medicalAdvise and userHabit are required." });
        return;
      }
      const prompt = `You are a health strategist. A doctor recommended "${medicalAdvise}", but the user prefers to keep their habit of "${userHabit}" for specific reasons (e.g., focus, schedule).
  Create a "Reconciled Strategy" that minimizes biological risk while respecting the user's lifestyle.
  Then, break this strategy down into 3 quantifiable metrics for a daily log.
  
  Medical Advice: ${medicalAdvise}
  User Constraint: ${userHabit}
  
  Return JSON in Chinese (\u7B80\u4F53\u4E2D\u6587) with keys: medicalNecessity, userConstraint, reconciledStrategy, quantifiableMetrics (array of {label,target,unit}).`;
      const { data, config } = await generateStructuredJson(prompt, RECONCILE_SCHEMA);
      res.json({ ...data, provider: config.provider, model: config.model });
    } catch (error) {
      console.error("[gemini/reconcile]", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Reconciliation failed." });
    }
  });
  router.post("/interpret-rag", async (req, res) => {
    if (process.env.RAG_ENABLED === "false") {
      res.status(503).json({ message: "RAG interpretation is disabled (RAG_ENABLED=false)." });
      return;
    }
    try {
      const {
        observations = [],
        redFlags = [],
        medicalTerm,
        value,
        knowledgeContext,
        chunkIds = [],
        careLevel
      } = req.body;
      if (!knowledgeContext?.trim()) {
        res.status(400).json({ message: "knowledgeContext is required (client-side retrieval)." });
        return;
      }
      const prompt = buildRagPromptBody({
        observations,
        redFlags,
        medicalTerm,
        value,
        knowledgeContext,
        careLevel
      });
      const { data, config } = await generateStructuredJson(prompt, RAG_SCHEMA);
      const normalized = normalizeRagPayload(data, careLevel);
      const sanitized = sanitizeSummaryPayload(normalized);
      const citations = filterCitations(sanitized.citations, chunkIds ?? []);
      res.json({
        ...sanitized,
        citations,
        chunkIds,
        ragEnabled: true,
        provider: config.provider,
        model: config.model
      });
    } catch (error) {
      console.error("[gemini/interpret-rag]", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "RAG interpretation failed." });
    }
  });
  router.post("/interpret-rag-multi", async (req, res) => {
    if (process.env.RAG_ENABLED === "false") {
      res.status(503).json({ message: "RAG interpretation is disabled (RAG_ENABLED=false)." });
      return;
    }
    try {
      const body = req.body;
      if (!body.knowledgeContext?.trim()) {
        res.status(400).json({ message: "knowledgeContext is required (client-side retrieval)." });
        return;
      }
      const prompt = buildRagPromptBody(body);
      const results = await generateStructuredJsonAll(prompt, RAG_SCHEMA);
      const mapped = results.map(({ data, config, error }) => {
        if (error) {
          return { provider: config.provider, model: config.model, label: config.label, error };
        }
        const normalized = normalizeRagPayload(data, body.careLevel);
        const sanitized = sanitizeSummaryPayload(normalized);
        const citations = filterCitations(sanitized.citations, body.chunkIds ?? []);
        return {
          ...sanitized,
          citations,
          chunkIds: body.chunkIds ?? [],
          ragEnabled: true,
          provider: config.provider,
          model: config.model,
          label: config.label
        };
      });
      const successful = mapped.filter((m) => !("error" in m && m.error));
      if (!successful.length) {
        res.status(502).json({
          message: "\u6240\u6709\u5DF2\u914D\u7F6E\u6A21\u578B\u5747\u89E3\u8BFB\u5931\u8D25",
          results: mapped
        });
        return;
      }
      res.json({
        primary: successful[0],
        alternatives: mapped.slice(1),
        all: mapped
      });
    } catch (error) {
      console.error("[gemini/interpret-rag-multi]", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Multi RAG failed." });
    }
  });
  return router;
}

// server/documentRoutes.ts
import { Router as Router3 } from "express";
var DASHSCOPE_BASE = process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
function requireDashScopeKey(_req, res, next) {
  if (!process.env.DASHSCOPE_API_KEY) {
    res.status(503).json({
      message: "DASHSCOPE_API_KEY is not configured. See README\u300COCR / \u6587\u6863\u89E3\u6790\u6D4B\u8BD5\u300D\u83B7\u53D6\u767E\u70BC\u5BC6\u94A5\u3002"
    });
    return;
  }
  next();
}
function createDocumentRouter() {
  const router = Router3();
  router.use(requireDashScopeKey);
  router.post("/vision-parse", async (req, res) => {
    try {
      const { imageBase64, mimeType = "image/jpeg", prompt } = req.body;
      if (!imageBase64?.trim()) {
        res.status(400).json({ message: "imageBase64 is required." });
        return;
      }
      const model = process.env.DASHSCOPE_VISION_MODEL ?? "qwen-vl-plus";
      const userPrompt = prompt ?? VISION_EXTRACT_PROMPT;
      const response = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${imageBase64}` }
                }
              ]
            }
          ],
          response_format: { type: "json_object" }
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        res.status(response.status).json({
          message: payload.error?.message ?? `DashScope request failed (${response.status})`
        });
        return;
      }
      const content = payload.choices?.[0]?.message?.content;
      if (!content) {
        res.status(502).json({ message: "Empty response from DashScope vision model." });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = { rawText: content };
      }
      res.json({
        provider: "dashscope",
        model,
        result: parsed,
        note: "PoC only \u2014 production OCR/tables should use \u963F\u91CC\u4E91\u6587\u6863\u667A\u80FD Document Mind or \u817E\u8BAF\u4E91 OCR."
      });
    } catch (error) {
      console.error("[document/vision-parse]", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Vision parse failed." });
    }
  });
  return router;
}

// server/agentRoutes.ts
import { Router as Router4 } from "express";
function requireLlm2(_req, res, next) {
  if (!getLlmStatus().configured) {
    res.status(503).json({
      message: "\u672A\u914D\u7F6E\u53EF\u7528 LLM\u3002\u8BF7\u5728 .env.local \u8BBE\u7F6E DASHSCOPE_API_KEY\uFF08\u767E\u70BC\uFF09\u6216 HUNYUAN_API_KEY\uFF0C\u5E76\u91CD\u542F npm run dev\u3002"
    });
    return;
  }
  next();
}
function formatObsSummary(observations) {
  return observations.slice(0, 24).map(
    (o) => `- ${o.standardName}${o.value != null ? `: ${o.value}${o.unit ? ` ${o.unit}` : ""}` : ""}${o.abnormalFlag ? ` [${o.abnormalFlag}]` : ""}${o.referenceRange ? ` (\u53C2\u8003 ${o.referenceRange})` : ""}`
  ).join("\n");
}
function formatFlagSummary(redFlags) {
  return redFlags.slice(0, 8).map((f) => `- [${f.severity}] ${f.title}: ${f.message}`).join("\n");
}
function formatBehaviorBlock(behaviorContext) {
  if (!behaviorContext?.trim()) return "";
  return `

${behaviorContext.trim()}

\uFF08\u884C\u4E3A\u6570\u636E\u4EC5\u4F5C\u80CC\u666F\uFF0C\u4E0D\u5F97\u63A8\u65AD\u56E0\u679C\u5173\u7CFB\uFF1B\u53EA\u80FD\u5F15\u7528\u4E0A\u8FF0\u4E8B\u5B9E\u4E2D\u7684\u6570\u5B57\u3002\uFF09`;
}
function inferRiskLevel(redFlags) {
  if (redFlags.some((f) => f.severity === "critical")) return "high";
  if (redFlags.some((f) => f.severity === "high")) return "high";
  if (redFlags.some((f) => f.severity === "moderate")) return "medium";
  return "low";
}
var SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    riskLevel: { type: "string", enum: ["low", "medium", "high"] },
    headline: { type: "string" },
    followUpHint: { type: "string" },
    careLevel: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chunkId: { type: "string" },
          title: { type: "string" },
          excerpt: { type: "string" }
        },
        required: ["chunkId", "title"]
      }
    }
  },
  required: ["summary", "riskLevel", "headline", "followUpHint", "careLevel", "citations"]
};
var ITEM_SCHEMA = {
  type: "object",
  properties: {
    observationId: { type: "string" },
    plainExplanation: { type: "string" },
    whyAbnormal: { type: "string" },
    lifestyleTips: { type: "array", items: { type: "string" } },
    severity: { type: "string", enum: ["low", "medium", "high"] },
    nature: { type: "string", enum: ["transient", "persistent"] },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chunkId: { type: "string" },
          title: { type: "string" },
          excerpt: { type: "string" }
        },
        required: ["chunkId", "title"]
      }
    }
  },
  required: ["observationId", "plainExplanation", "whyAbnormal", "lifestyleTips", "severity", "nature"]
};
async function chatCompletion(messages) {
  const config = resolveLlmConfig();
  if (!config) throw new Error("LLM \u672A\u914D\u7F6E");
  let baseUrl;
  let apiKey;
  if (config.provider === "dashscope") {
    baseUrl = process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
    apiKey = process.env.DASHSCOPE_API_KEY;
  } else if (config.provider === "hunyuan") {
    baseUrl = process.env.HUNYUAN_BASE_URL ?? "https://tokenhub.tencentmaas.com/v1";
    apiKey = process.env.HUNYUAN_API_KEY;
  } else {
    throw new Error("Agent \u804A\u5929\u6682\u4EC5\u652F\u6301\u767E\u70BC/\u6DF7\u5143 OpenAI \u517C\u5BB9\u6A21\u5F0F");
  }
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.4
    })
  });
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error?.message ?? `LLM \u8BF7\u6C42\u5931\u8D25 (${res.status})`);
  }
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM \u8FD4\u56DE\u7A7A\u5185\u5BB9");
  return content;
}
function createAgentRouter() {
  const router = Router4();
  router.get("/health", (_req, res) => {
    const llm = getLlmStatus();
    res.json({
      ok: true,
      llmConfigured: llm.configured,
      llmProvider: llm.provider,
      llmLabel: llm.label
    });
  });
  router.post("/interpret", requireLlm2, async (req, res) => {
    try {
      const {
        mode,
        observations = [],
        redFlags = [],
        careLevel = "S1",
        knowledgeContext = "",
        chunkIds = [],
        targets = [],
        behaviorContext = ""
      } = req.body;
      if (mode !== "summary" && mode !== "items") {
        res.status(400).json({ message: "mode \u5FC5\u987B\u4E3A summary \u6216 items" });
        return;
      }
      const obsSummary = formatObsSummary(observations);
      const flagSummary = formatFlagSummary(redFlags);
      const ruleRisk = inferRiskLevel(redFlags);
      const config = resolveLlmConfig();
      if (mode === "summary") {
        if (!knowledgeContext?.trim()) {
          res.status(400).json({ message: "summary \u6A21\u5F0F\u9700\u8981 knowledgeContext\uFF08\u5BA2\u6237\u7AEF\u77E5\u8BC6\u5E93\u68C0\u7D22\uFF09" });
          return;
        }
        const abnormalCount = observations.filter((o) => o.abnormalFlag != null).length;
        const prompt = `\u4F60\u662F Health Link \u5065\u5EB7\u89E3\u8BFB Agent\u3002\u57FA\u4E8E\u4E0B\u65B9\u300C\u77E5\u8BC6\u5E93\u7247\u6BB5\u300D\u4E0E\u7528\u6237\u4F53\u68C0\u62A5\u544A\uFF0C\u7528\u6E29\u6696\u3001\u8BDA\u5B9E\u7684\u300C\u8BF4\u4EBA\u8BDD\u300D\u7ED9\u51FA\u6574\u4EFD\u62A5\u544A\u6458\u8981\u3002

\u786C\u6027\u7EA6\u675F\uFF08L6 \u5B89\u5168\u5C42\uFF09\uFF1A
- \u4E0D\u5F97\u8BCA\u65AD\u3001\u4E0D\u5F97\u5F00\u5904\u65B9\u3001\u4E0D\u5F97\u5EFA\u8BAE\u505C\u836F
- \u4F7F\u7528\u300C\u53EF\u80FD\u4E0E\u2026\u6709\u5173\u300D\u300C\u5EFA\u8BAE\u8FDB\u4E00\u6B65\u8BC4\u4F30\u300D\u7B49\u8868\u8FF0
- \u4E0D\u5F97\u4FDD\u8BC1\u65E0\u75BE\u75C5
- \u5FC5\u987B\u5728 citations \u4E2D\u5F15\u7528\u6240\u7528\u77E5\u8BC6\u7247\u6BB5 id\uFF08\u683C\u5F0F l2:... / l3:... / l5:... / l6:...\uFF09
- \u82E5 careLevel \u4E3A S4\uFF0C\u5FC5\u987B\u660E\u786E\u5EFA\u8BAE\u7ACB\u5373/\u6025\u8BCA\u5C31\u533B\uFF0C\u4F46\u4ECD\u4E0D\u5F97\u4E0B\u8BCA\u65AD\u6216\u5728\u7EBF\u5904\u7F6E
- \u82E5 careLevel \u4E3A S2/S3\uFF0C\u5F3A\u8C03\u53CA\u65F6\u5C31\u533B\u590D\u67E5\uFF0C\u4F46\u4ECD\u4E0D\u5F97\u4E0B\u8BCA\u65AD

\u62A5\u544A\u6982\u51B5\uFF1A\u5171 ${observations.length} \u9879\uFF0C${abnormalCount} \u9879\u6807\u8BB0\u5F02\u5E38\u3002
\u89C4\u5219\u5F15\u64CE\u98CE\u9669\u7B49\u7EA7\uFF08\u53C2\u8003\uFF09\uFF1A${ruleRisk}
\u7167\u62A4\u7B49\u7EA7\uFF08\u53C2\u8003\uFF09\uFF1A${careLevel}

\u68C0\u9A8C\u9879\u76EE\uFF08\u8282\u9009\uFF09\uFF1A
${obsSummary || "\uFF08\u65E0\uFF09"}

\u89C4\u5219\u5F15\u64CE\u63D0\u793A\uFF08\u8282\u9009\uFF09\uFF1A
${flagSummary || "\uFF08\u65E0\uFF09"}

\u77E5\u8BC6\u5E93\u7247\u6BB5\uFF08\u4EC5\u53EF\u5F15\u7528\u4EE5\u4E0B\u5185\u5BB9\uFF0C\u52FF\u7F16\u9020\u6307\u5357\uFF09\uFF1A
---
${knowledgeContext}
---${formatBehaviorBlock(behaviorContext)}

\u8BF7\u7528\u7B80\u4F53\u4E2D\u6587\u8FD4\u56DE JSON\uFF1Asummary\uFF082\uFF5E4 \u53E5\u6574\u6BB5\u8BF4\u4EBA\u8BDD\u6458\u8981\uFF09\u3001riskLevel\uFF08low|medium|high\uFF09\u3001headline\uFF08\u4E00\u53E5\u8BDD\u6807\u9898\uFF0C15 \u5B57\u5185\uFF09\u3001followUpHint\uFF08\u590D\u67E5/\u5C31\u533B\u5EFA\u8BAE\uFF0C1 \u53E5\uFF09\u3001careLevel\uFF08S0|S1|S2|S3|S4\uFF09\u3001citations\uFF08[{chunkId,title,excerpt}]\uFF0C\u81F3\u5C11 1 \u6761\uFF09\u3002`;
        const { data } = await generateStructuredJson(prompt, SUMMARY_SCHEMA);
        const sanitized = sanitizeSummaryPayload(data);
        const citations = filterCitations(sanitized.citations, chunkIds);
        res.json({
          mode: "summary",
          summary: sanitized.summary,
          riskLevel: sanitized.riskLevel ?? ruleRisk,
          headline: sanitized.headline,
          followUpHint: sanitized.followUpHint,
          careLevel: typeof sanitized.careLevel === "string" ? sanitized.careLevel : careLevel,
          citations,
          chunkIds,
          l6Filtered: sanitized.l6Filtered === true,
          disclaimer: "\u672C\u89E3\u8BFB\u4EC5\u4F9B\u5065\u5EB7\u7BA1\u7406\u53C2\u8003\uFF0C\u4E0D\u80FD\u66FF\u4EE3\u533B\u751F\u9762\u8BCA\u3001\u8BCA\u65AD\u6216\u6CBB\u7597\u3002\u5982\u6709\u4E0D\u9002\u8BF7\u53CA\u65F6\u5C31\u533B\u3002",
          provider: config?.provider,
          model: config?.model
        });
        return;
      }
      if (!knowledgeContext?.trim()) {
        res.status(400).json({ message: "items \u6A21\u5F0F\u9700\u8981 knowledgeContext\uFF08\u5BA2\u6237\u7AEF\u77E5\u8BC6\u5E93\u68C0\u7D22\uFF09" });
        return;
      }
      if (!targets.length) {
        res.status(400).json({ message: "items \u6A21\u5F0F\u9700\u8981 targets \u6570\u7EC4" });
        return;
      }
      const limited = targets.slice(0, 5);
      const items = [];
      for (const target of limited) {
        const prompt = `\u4F60\u662F Health Link \u5065\u5EB7\u89E3\u8BFB Agent\u3002\u57FA\u4E8E\u77E5\u8BC6\u5E93\u7247\u6BB5\uFF0C\u7528\u8BF4\u4EBA\u8BDD\u89E3\u8BFB\u5355\u9879\u5F02\u5E38\u3002

\u786C\u6027\u7EA6\u675F\uFF1A\u4E0D\u5F97\u8BCA\u65AD\u3001\u4E0D\u5F97\u5F00\u5904\u65B9\uFF1B\u5FC5\u987B\u5728 citations \u4E2D\u5F15\u7528\u77E5\u8BC6\u7247\u6BB5 id\u3002

\u7167\u62A4\u7B49\u7EA7\uFF1A${careLevel}
\u7528\u6237\u5173\u6CE8\uFF1A${target.medicalTerm} = ${target.value}

\u62A5\u544A\u89C2\u6D4B\uFF08\u8282\u9009\uFF09\uFF1A
${obsSummary}

\u89C4\u5219\u7EA2\u65D7\uFF08\u8282\u9009\uFF09\uFF1A
${flagSummary}

\u77E5\u8BC6\u5E93\u7247\u6BB5\uFF1A
---
${knowledgeContext}
---${formatBehaviorBlock(behaviorContext)}

\u8BF7\u8FD4\u56DE JSON\uFF1AobservationId="${target.observationId}", plainExplanation, whyAbnormal, lifestyleTips (string[] \u6700\u591A3\u6761), severity (low|medium|high), nature (transient|persistent), citations ([{chunkId,title,excerpt}]).`;
        const { data } = await generateStructuredJson(prompt, ITEM_SCHEMA);
        const sanitized = sanitizeItemPayload(data);
        items.push({
          ...sanitized,
          observationId: sanitized.observationId ?? target.observationId,
          citations: filterCitations(sanitized.citations, chunkIds),
          chunkIds
        });
      }
      res.json({
        mode: "items",
        items,
        disclaimer: "\u672C\u89E3\u8BFB\u4EC5\u4F9B\u5065\u5EB7\u7BA1\u7406\u53C2\u8003\uFF0C\u4E0D\u80FD\u66FF\u4EE3\u533B\u751F\u9762\u8BCA\u3001\u8BCA\u65AD\u6216\u6CBB\u7597\u3002\u5982\u6709\u4E0D\u9002\u8BF7\u53CA\u65F6\u5C31\u533B\u3002",
        provider: config?.provider,
        model: config?.model
      });
    } catch (error) {
      console.error("[agent/interpret]", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Interpret failed." });
    }
  });
  router.post("/chat", requireLlm2, async (req, res) => {
    try {
      const {
        messages = [],
        observations = [],
        reportSummary = "",
        interpretedItems = [],
        behaviorContext = ""
      } = req.body;
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUser?.content?.trim()) {
        res.status(400).json({ message: "\u9700\u8981\u81F3\u5C11\u4E00\u6761\u7528\u6237\u6D88\u606F" });
        return;
      }
      if (!observations.length) {
        res.status(400).json({ message: "\u9700\u8981\u62A5\u544A\u89C2\u6D4B\u6570\u636E\u4F5C\u4E3A\u4E0A\u4E0B\u6587" });
        return;
      }
      const obsSummary = formatObsSummary(observations);
      const itemBlock = interpretedItems.slice(0, 8).map((i) => `- ${i.standardName}: ${i.plainExplanation.slice(0, 200)}`).join("\n");
      const system = `\u4F60\u662F Health Link \u5065\u5EB7\u89E3\u8BFB Agent\uFF0C\u5E2E\u52A9\u7528\u6237\u7406\u89E3\u672C\u6B21\u4F53\u68C0\u62A5\u544A\u3002

\u786C\u6027\u7EA6\u675F\uFF1A
- \u4E0D\u5F97\u8BCA\u65AD\u3001\u4E0D\u5F97\u5F00\u5904\u65B9\u3001\u4E0D\u5F97\u5EFA\u8BAE\u505C\u836F
- \u4EC5\u57FA\u4E8E\u4E0B\u65B9\u62A5\u544A\u4E0A\u4E0B\u6587\u56DE\u7B54\uFF1B\u82E5\u65E0\u8DB3\u591F\u4FE1\u606F\uFF0C\u8BDA\u5B9E\u8BF4\u660E\u5E76\u5EFA\u8BAE\u5C31\u533B\u590D\u67E5
- \u7528\u7B80\u4F53\u4E2D\u6587\u3001\u6E29\u6696\u3001\u7B80\u6D01\uFF08\u624B\u673A\u9605\u8BFB\uFF0C\u6BCF\u6BB5\u4E0D\u8D85\u8FC7 3 \u53E5\uFF09

\u62A5\u544A\u6458\u8981\uFF1A${reportSummary || "\uFF08\u6682\u65E0\uFF09"}

\u5DF2\u89E3\u8BFB\u5F02\u5E38\u9879\uFF1A
${itemBlock || "\uFF08\u6682\u65E0\uFF09"}

\u62A5\u544A\u89C2\u6D4B\uFF08\u8282\u9009\uFF09\uFF1A
${obsSummary}${formatBehaviorBlock(behaviorContext)}`;
      const chatMessages = [
        { role: "system", content: system },
        ...messages.slice(-10).map((m) => ({ role: m.role, content: m.content }))
      ];
      const replyRaw = await chatCompletion(chatMessages);
      const { reply, l6Filtered } = sanitizeChatReply(replyRaw);
      const config = resolveLlmConfig();
      res.json({
        reply,
        l6Filtered,
        disclaimer: "\u672C\u56DE\u590D\u4EC5\u4F9B\u53C2\u8003\uFF0C\u4E0D\u80FD\u66FF\u4EE3\u533B\u751F\u9762\u8BCA\u4E0E\u8BCA\u65AD\u3002",
        provider: config?.provider,
        model: config?.model
      });
    } catch (error) {
      console.error("[agent/chat]", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Chat failed." });
    }
  });
  return router;
}

// server/pipelineRoutes.ts
import { Router as Router5 } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var OUTPUT_PATH = path.resolve(__dirname, "../../Healther-linker/output/pipeline_output.json");
function createPipelineRouter() {
  const router = Router5();
  router.get("/output", (_req, res) => {
    if (!fs.existsSync(OUTPUT_PATH)) {
      res.status(404).json({ message: "pipeline_output.json not found" });
      return;
    }
    const raw = fs.readFileSync(OUTPUT_PATH, "utf-8");
    res.type("json").send(raw);
  });
  return router;
}

// server/wechatRoutes.ts
import { Router as Router6 } from "express";

// server/wechatAuth.ts
import crypto from "crypto";
var WECHAT_SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";
var DEFAULT_TOKEN_TTL_SEC = 7 * 24 * 3600;
function isWechatConfigured() {
  return Boolean(process.env.WECHAT_APPID?.trim() && process.env.WECHAT_APPSECRET?.trim());
}
function base64UrlEncode(input) {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}
function base64UrlDecode(input) {
  return Buffer.from(input, "base64url");
}
function getJwtSecret() {
  const secret = process.env.WECHAT_JWT_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("\u751F\u4EA7\u73AF\u5883\u5FC5\u987B\u8BBE\u7F6E WECHAT_JWT_SECRET");
  }
  return "health-link-dev-wechat-jwt-secret";
}
function signWechatToken(openid, ttlSec = DEFAULT_TOKEN_TTL_SEC) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = {
    sub: openid,
    openid,
    iat: Math.floor(Date.now() / 1e3),
    exp: Math.floor(Date.now() / 1e3) + ttlSec
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", getJwtSecret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}
function verifyWechatToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac("sha256", getJwtSecret()).update(`${header}.${body}`).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(body).toString("utf8"));
    if (payload.exp != null && payload.exp < Math.floor(Date.now() / 1e3)) return null;
    if (!payload.openid) return null;
    return { sub: payload.sub, openid: payload.openid };
  } catch {
    return null;
  }
}
async function exchangeWechatCode(code) {
  const appid = process.env.WECHAT_APPID?.trim();
  const secret = process.env.WECHAT_APPSECRET?.trim();
  if (!appid || !secret) {
    throw new Error("\u672A\u914D\u7F6E WECHAT_APPID / WECHAT_APPSECRET");
  }
  const url = new URL(WECHAT_SESSION_URL);
  url.searchParams.set("appid", appid);
  url.searchParams.set("secret", secret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.errcode || !data.openid) {
    throw new Error(data.errmsg ?? `\u5FAE\u4FE1\u767B\u5F55\u5931\u8D25 (${data.errcode ?? "unknown"})`);
  }
  return { openid: data.openid, unionid: data.unionid };
}
function extractBearerToken(req) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}
function requireWechatAuth(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ message: "\u9700\u8981\u5FAE\u4FE1\u5C0F\u7A0B\u5E8F\u767B\u5F55 token\uFF08Authorization: Bearer\uFF09" });
    return;
  }
  const session = verifyWechatToken(token);
  if (!session) {
    res.status(401).json({ message: "\u767B\u5F55\u5DF2\u8FC7\u671F\u6216 token \u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0 wx.login" });
    return;
  }
  req.wechatUser = session;
  next();
}

// server/wechatRoutes.ts
function createWechatRouter() {
  const router = Router6();
  router.get("/status", (_req, res) => {
    res.json({
      configured: isWechatConfigured(),
      loginPath: "/api/wechat/login",
      sessionPath: "/api/wechat/session"
    });
  });
  router.post("/login", async (req, res) => {
    try {
      if (!isWechatConfigured()) {
        res.status(503).json({
          message: "\u5FAE\u4FE1\u767B\u5F55\u672A\u914D\u7F6E\u3002\u8BF7\u5728 .env.local \u8BBE\u7F6E WECHAT_APPID \u4E0E WECHAT_APPSECRET\u3002"
        });
        return;
      }
      const { code } = req.body;
      if (!code?.trim()) {
        res.status(400).json({ message: "\u7F3A\u5C11 code\uFF08\u7531\u5C0F\u7A0B\u5E8F wx.login \u83B7\u53D6\uFF09" });
        return;
      }
      const { openid, unionid } = await exchangeWechatCode(code.trim());
      const token = signWechatToken(openid);
      res.json({
        token,
        expiresIn: 7 * 24 * 3600,
        user: {
          openid,
          unionid: unionid ?? null
        }
      });
    } catch (error) {
      console.error("[wechat/login]", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "\u5FAE\u4FE1\u767B\u5F55\u5931\u8D25"
      });
    }
  });
  router.get("/session", (req, res) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ message: "\u672A\u767B\u5F55" });
      return;
    }
    const session = verifyWechatToken(token);
    if (!session) {
      res.status(401).json({ message: "\u767B\u5F55\u5DF2\u8FC7\u671F" });
      return;
    }
    res.json({ ok: true, openid: session.openid });
  });
  router.get("/me", requireWechatAuth, (req, res) => {
    const user = req.wechatUser;
    res.json({ openid: user?.openid });
  });
  return router;
}

// server/corsConfig.ts
import cors from "cors";
function createCorsMiddleware(isProd2) {
  const configured = process.env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean);
  if (!isProd2) {
    return cors({ origin: true, credentials: true });
  }
  if (!configured?.length) {
    return cors({
      origin: true,
      credentials: true
    });
  }
  return cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (configured.includes(origin) || configured.includes("*")) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  });
}

// server/index.ts
var isAzure = Boolean(process.env.WEBSITE_SITE_NAME) || Boolean(process.env.WEBSITE_INSTANCE_ID) || Boolean(process.env.WEBSITE_RESOURCE_GROUP);
if (!isAzure) {
  dotenv.config({ path: ".env.local" });
}
dotenv.config();
var __dirname2 = path2.dirname(fileURLToPath2(import.meta.url));
var app = express();
var PORT = Number(process.env.PORT) || 3001;
var HOST = process.env.HOST ?? "0.0.0.0";
var isProd = process.env.NODE_ENV === "production";
function getLanIPv4() {
  const ips = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}
app.use(createCorsMiddleware(isProd));
app.use(express.json({ limit: "15mb" }));
app.get("/api/lan-info", (_req, res) => {
  const ips = getLanIPv4();
  res.json({
    port: PORT,
    agentUrls: ips.map((ip) => `http://${ip}:${PORT}/agent`),
    homeUrls: ips.map((ip) => `http://${ip}:${PORT}/`),
    hint: "\u624B\u673A\u987B\u4E0E\u7535\u8111\u540C\u4E00 WiFi\uFF1B\u751F\u4EA7\u6A21\u5F0F\u901A\u5E38\u7528 3001 \u7AEF\u53E3\uFF0C\u672C\u5730\u5F00\u53D1\u524D\u7AEF\u901A\u5E38\u7528 3000 \u7AEF\u53E3"
  });
});
app.get("/api/health", (_req, res) => {
  const llm = getLlmStatus();
  const raccoon = getRaccoonStatus();
  res.json({
    ok: true,
    environment: process.env.NODE_ENV ?? "development",
    host: HOST,
    port: PORT,
    azure: isAzure,
    ragEnabled: process.env.RAG_ENABLED !== "false",
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
    wechatConfigured: isWechatConfigured()
  });
});
app.use("/api/import", createImportRouter());
app.use("/api/wechat", createWechatRouter());
app.use("/api/gemini", createGeminiRouter());
app.use("/api/document", createDocumentRouter());
app.use("/api/agent", createAgentRouter());
app.use("/api/pipeline", createPipelineRouter());
if (isProd) {
  const distPath = path2.resolve(__dirname2, "../dist");
  const indexPath = path2.join(distPath, "index.html");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error("Failed to serve frontend build:", err);
        res.status(500).send(
          'Frontend build not found. Please run "npm run build" before starting the production server.'
        );
      }
    });
  });
}
app.listen(PORT, HOST, () => {
  console.log(`Health Link listening on ${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? "development"}`);
  console.log(`Azure runtime: ${isAzure ? "yes" : "no"}`);
  if (!isProd) {
    for (const ip of getLanIPv4()) {
      console.log(`  \u624B\u673A\u8BBF\u95EE Agent \u2192 http://${ip}:${PORT}/agent`);
    }
  }
  const llm = getLlmStatus();
  const raccoon = getRaccoonStatus();
  if (!llm.configured) {
    console.warn(
      "Warning: No LLM configured. Set DASHSCOPE_API_KEY, HUNYUAN_API_KEY, or GEMINI_API_KEY."
    );
  } else {
    console.log(`LLM active: ${llm.label} (${llm.model}) via LLM_PROVIDER=${llm.preferred}`);
  }
  if (raccoon.configured && raccoon.enabled) {
    console.log(`\u529E\u516C\u5C0F\u6D63\u718A: ${process.env.RACCOON_API_HOST ?? "https://xiaohuanxiong.com"} (\u8DE8\u62A5\u544A\u5206\u6790)`);
  }
});
