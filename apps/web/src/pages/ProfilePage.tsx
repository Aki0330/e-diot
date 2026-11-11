import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client.js";
import type { LlmConfig, UserProfile } from "../api/types.js";
import { useToast } from "../components/Toast.js";
import { fmt } from "../utils/format.js";

export interface ProfilePageProps {
  readonly active: boolean;
}

function fmtDateTime(value: string | null): string {
  if (value === null) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
}

/** 个人页：账户信息 + 用户级 LLM 配置（base_url / api_key） */
export function ProfilePage({ active }: ProfilePageProps) {
  const toast = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [llm, setLlm] = useState<LlmConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [me, config] = await Promise.all([api.me(), api.llmConfig()]);
      setProfile(me);
      setLlm(config);
      setBaseUrl(config.base_url ?? "");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const save = async (): Promise<void> => {
    const trimmed = baseUrl.trim();
    if (trimmed !== "" && !/^https?:\/\/\S+$/i.test(trimmed)) {
      toast("Base URL 必须以 http:// 或 https:// 开头", "error");
      return;
    }
    setSaving(true);
    try {
      const saved = await api.saveLlmConfig({
        base_url: trimmed,
        ...(apiKey.trim() === "" ? {} : { api_key: apiKey.trim() }),
      });
      setLlm(saved);
      setProfile((prev) =>
        prev === null
          ? prev
          : { ...prev, llm_base_url: saved.base_url, has_llm_key: saved.has_api_key },
      );
      setApiKey("");
      toast("LLM 配置已保存，下一次对话起生效", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), "error");
    } finally {
      setSaving(false);
    }
  };

  const clear = async (): Promise<void> => {
    setSaving(true);
    try {
      const saved = await api.saveLlmConfig({ base_url: "", api_key: "" });
      setLlm(saved);
      setBaseUrl("");
      setApiKey("");
      toast("已清除，将回落到全局配置", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), "error");
    } finally {
      setSaving(false);
    }
  };

  if (profile === null) {
    return (
      <div className="profile-page">
        <div className="empty-state">
          {error === null ? (
            <div className="spinner" />
          ) : (
            <div className="empty-text">加载失败: {error}</div>
          )}
        </div>
      </div>
    );
  }

  const usingOwn = llm !== null && llm.has_api_key && (llm.base_url ?? "") !== "";

  return (
    <div className="profile-page">
      <div className="profile-hero">
        <div className="profile-avatar">👤</div>
        <div>
          <div className="profile-name">{profile.username}</div>
          <div className="profile-id">{profile.user_id}</div>
        </div>
      </div>

      <div className="section-header">
        <h3>账户信息</h3>
      </div>
      <div className="profile-card">
        <div className="profile-row">
          <span className="profile-key">手机号</span>
          <span className="profile-value">{profile.phone_num ?? "-"}</span>
        </div>
        <div className="profile-row">
          <span className="profile-key">邮箱</span>
          <span className="profile-value">{profile.email ?? "-"}</span>
        </div>
        <div className="profile-row">
          <span className="profile-key">月度总预算</span>
          <span className="profile-value">¥{fmt(profile.budget)}</span>
        </div>
        <div className="profile-row">
          <span className="profile-key">注册时间</span>
          <span className="profile-value">{fmtDateTime(profile.created_at)}</span>
        </div>
        <div className="profile-row">
          <span className="profile-key">账户状态</span>
          <span className="profile-value">{profile.is_active ? "正常" : "已停用"}</span>
        </div>
      </div>

      <div className="section-header">
        <h3>LLM 配置</h3>
      </div>
      <div className="profile-card">
        <div className="profile-row">
          <span className="profile-key">当前生效</span>
          <span className="profile-value">{usingOwn ? "用户级配置" : "全局默认"}</span>
        </div>
        <div className="profile-row">
          <span className="profile-key">模型</span>
          <span className="profile-value">{llm?.model ?? "-"}</span>
        </div>

        <div className="form-group">
          <label htmlFor="llm-base-url">Base URL</label>
          <input
            id="llm-base-url"
            className="input"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.deepseek.com"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="form-group">
          <label htmlFor="llm-api-key">API Key</label>
          <input
            id="llm-api-key"
            className="input"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={llm?.has_api_key ? "已配置，留空则不修改" : "sk-..."}
            autoComplete="new-password"
          />
        </div>

        <p className="profile-hint">
          只保存在你的账户下；接口只回传「是否已配置」，不会返回密钥明文。Base URL 与 Key
          同时存在时才会覆盖全局配置，保存后下一次对话即生效。
        </p>

        <div className="profile-actions">
          <button className="btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
          <button className="btn-secondary" onClick={() => void clear()} disabled={saving}>
            清除配置
          </button>
        </div>
      </div>

      {error !== null && <p className="profile-hint error">{error}</p>}
    </div>
  );
}
