import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client.js";
import type {
  LlmConfig,
  PersonaId,
  ProactiveLevel,
  UserProfile,
  UserSettings,
} from "../api/types.js";
import { AvatarPicker } from "../components/AvatarPicker.js";
import { useToast } from "../components/Toast.js";
import { getAvatar, setAvatar } from "../utils/avatar.js";
import { fmt } from "../utils/format.js";

export interface ProfilePageProps {
  readonly active: boolean;
  /** 移动端二级入口：预算 / 记忆 */
  readonly onNavigateSecondary?: (view: "budget" | "memory") => void;
  /** 退出登录回调（桌面端接入，移动端顶栏已有退出） */
  readonly onLogout?: () => void;
}

function fmtDate(value: string | null): string {
  if (value === null) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function daysSince(value: string | null): number {
  if (value === null) return 1;
  const start = new Date(value).getTime();
  if (Number.isNaN(start)) return 1;
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}

const PERSONA_OPTIONS: readonly { id: PersonaId; name: string; en: string; desc: string }[] = [
  { id: "lurker", name: "潜水型", en: "LURKER", desc: "安静记录，必要时才出现" },
  { id: "introvert", name: "i 人型", en: "INTROVERT", desc: "温和、低频、不打扰" },
  { id: "buddy", name: "搭子型", en: "BUDDY", desc: "像朋友一样自然交流" },
  { id: "chatterbox", name: "话痨型", en: "CHATTERBOX", desc: "主动分享发现，喜欢聊天" },
];

const LEVEL_OPTIONS: readonly { id: ProactiveLevel; label: string }[] = [
  { id: "low", label: "低调 · 只在值得提醒时出现" },
  { id: "medium", label: "适中 · 每天最多一次" },
  { id: "high", label: "主动 · 可多次来找你" },
];

/** 个人页：形象 + 相处方式 + 提醒节奏 + 账户信息（模型配置收进「高级」） */
export function ProfilePage({ active, onNavigateSecondary, onLogout }: ProfilePageProps) {
  const toast = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [llm, setLlm] = useState<LlmConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [persona, setPersona] = useState<PersonaId>("buddy");
  const [level, setLevel] = useState<ProactiveLevel>("medium");
  const [careTime, setCareTime] = useState("17:45");
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("08:00");
  const [snooze, setSnooze] = useState<"none" | "1d" | "7d">("none");
  const [savingSettings, setSavingSettings] = useState(false);

  const [avatar, setAvatarState] = useState<string>(() => getAvatar());
  const [picking, setPicking] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [me, config, current] = await Promise.all([api.me(), api.llmConfig(), api.settings()]);
      setProfile(me);
      setLlm(config);
      setBaseUrl(config.base_url ?? "");
      setSettings(current);
      setPersona(current.persona);
      setLevel(current.proactive_level);
      setCareTime(current.care_time);
      setQuietStart(current.quiet_start);
      setQuietEnd(current.quiet_end);
      setSnooze("none");
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
      toast("模型配置已保存，下一次对话起生效", "success");
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
      toast("已清除，回到默认模型", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), "error");
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async (): Promise<void> => {
    setSavingSettings(true);
    try {
      const snoozeUntil =
        snooze === "none"
          ? null
          : new Date(Date.now() + (snooze === "1d" ? 1 : 7) * 86_400_000).toISOString();
      const saved = await api.saveSettings({
        persona,
        proactive_level: level,
        care_time: careTime,
        quiet_start: quietStart,
        quiet_end: quietEnd,
        snooze_until: snoozeUntil,
      });
      setSettings(saved);
      setSnooze("none");
      toast("已经按你的偏好调整好了", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), "error");
    } finally {
      setSavingSettings(false);
    }
  };

  if (profile === null) {
    return (
      <div className="page">
        <div className="empty">
          {error === null ? <div className="spinner" /> : <p className="empty-desc">{error}</p>}
        </div>
      </div>
    );
  }

  const usingOwn = llm !== null && llm.has_api_key && (llm.base_url ?? "") !== "";
  const personaName = PERSONA_OPTIONS.find((item) => item.id === persona)?.name ?? "搭子型";

  return (
    <div className="page me-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">PROFILE · 形象与偏好</p>
          <h2 className="page-title">我的</h2>
          <p className="page-desc">它记得你的口味、目标和边界，也记得你希望被提醒的分寸。</p>
        </div>
      </div>

      <section className="me-hero">
        <div className="me-avatar">
          <span>{avatar}</span>
        </div>
        <div className="me-hero-main">
          <div className="me-name">{profile.username}</div>
          <div className="me-meta">
            第 {daysSince(profile.created_at)} 天 · {personaName} · 月预算 ¥{fmt(profile.budget)}
          </div>
        </div>
        <button className="btn-ghost btn-sm" onClick={() => setPicking((value) => !value)}>
          {picking ? "收起" : "换形象"}
        </button>
      </section>

      <div className="profile-grid">
        <section className="card span-7">
          <div className="card-head">
            <div>
              <div className="card-title">相处方式</div>
              <div className="card-sub">只影响说话的语气和长短，不影响判断标准</div>
            </div>
            <span className="badge lime tiny">{personaName}</span>
          </div>

          <div className="persona-grid">
            {PERSONA_OPTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`persona-option${persona === item.id ? " active" : ""}`}
                onClick={() => setPersona(item.id)}
              >
                <span className="persona-name">{item.name}</span>
                <span className="persona-en">{item.en}</span>
                <span className="persona-desc">{item.desc}</span>
              </button>
            ))}
          </div>

          <div className="card-foot">
            <span className="profile-hint">选好之后，它下次对话就会换一种方式跟你说话。</span>
            <button
              className="btn-primary btn-sm"
              onClick={() => void saveSettings()}
              disabled={savingSettings}
            >
              {savingSettings ? "保存中…" : "保存"}
            </button>
          </div>
        </section>

        <section className="card span-5">
          <div className="card-head">
            <div>
              <div className="card-title">账户</div>
              <div className="card-sub">注册时填的信息</div>
            </div>
            <span className={`badge ${profile.is_active ? "lime" : "red"} tiny`}>
              {profile.is_active ? "正常" : "已停用"}
            </span>
          </div>
          <div className="profile-rows">
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
              <span className="profile-key">加入时间</span>
              <span className="profile-value">{fmtDate(profile.created_at)}</span>
            </div>
          </div>

          {onLogout !== undefined && (
            <div className="card-foot">
              <span className="profile-hint">退出后需要重新登录才能继续记账</span>
              <button className="btn-ghost btn-sm" type="button" onClick={onLogout}>
                退出登录
              </button>
            </div>
          )}

          {picking && (
            <div className="card-extra">
              <AvatarPicker
                value={avatar}
                onChange={(emoji) => {
                  setAvatarState(emoji);
                  setAvatar(emoji);
                }}
                label="选一个记账搭子"
                hint="随时可以再换"
              />
            </div>
          )}
        </section>
      </div>

      <section className="card rhythm-card">
        <div className="card-head">
          <div>
            <div className="card-title">提醒节奏</div>
            <div className="card-sub">什么时候来找你、什么时候别打扰，由你定</div>
          </div>
          {settings?.snooze_until !== null && settings?.snooze_until !== undefined && (
            <span className="badge amber tiny">已暂停主动消息</span>
          )}
        </div>

        <div className="settings-grid">
          <label>
            主动程度
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value as ProactiveLevel)}
            >
              {LEVEL_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            每日关怀时间
            <input
              type="time"
              value={careTime}
              onChange={(event) => setCareTime(event.target.value)}
            />
          </label>
          <label>
            免打扰开始
            <input
              type="time"
              value={quietStart}
              onChange={(event) => setQuietStart(event.target.value)}
            />
          </label>
          <label>
            免打扰结束
            <input
              type="time"
              value={quietEnd}
              onChange={(event) => setQuietEnd(event.target.value)}
            />
          </label>
          <label>
            暂停主动消息
            <select
              value={snooze}
              onChange={(event) => setSnooze(event.target.value as "none" | "1d" | "7d")}
            >
              <option value="none">不暂停</option>
              <option value="1d">暂停 1 天</option>
              <option value="7d">暂停 1 周</option>
            </select>
          </label>
        </div>

        <div className="card-foot">
          <span className="profile-hint">
            {settings?.snooze_until !== null && settings?.snooze_until !== undefined
              ? `主动消息已暂停至 ${fmtDate(settings.snooze_until)}`
              : `免打扰时段 ${quietStart}–${quietEnd} 内不会主动找你。`}
          </span>
          <button
            className="btn-primary btn-sm"
            onClick={() => void saveSettings()}
            disabled={savingSettings}
          >
            {savingSettings ? "保存中…" : "保存"}
          </button>
        </div>
      </section>

      <section className="card advanced-card">
        <button
          type="button"
          className="advanced-head"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          <div>
            <div className="card-title">高级设置 · 模型服务</div>
            <div className="card-sub">想用自己的大模型 API 才需要动，默认不用管</div>
          </div>
          <div className="advanced-right">
            <span className={`badge ${usingOwn ? "lime" : "ink"} tiny`}>
              {usingOwn ? "我的配置" : "默认模型"}
            </span>
            <span className="advanced-chev">{advancedOpen ? "▴" : "▾"}</span>
          </div>
        </button>

        {advancedOpen && (
          <div className="advanced-body">
            <div className="profile-rows">
              <div className="profile-row">
                <span className="profile-key">当前生效</span>
                <span className="profile-value">{usingOwn ? "我的配置" : "默认模型"}</span>
              </div>
              <div className="profile-row">
                <span className="profile-key">Base URL</span>
                <span className="profile-value">{llm?.base_url ?? "（未配置）"}</span>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 14 }}>
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
                placeholder={llm?.has_api_key ? "已配置，留空则不改" : "sk-..."}
                autoComplete="new-password"
              />
            </div>

            <p className="profile-hint">
              密钥只存在你自己的账户里，这里只显示「是否已配置」，不会回显明文。Base URL
              和 Key 都填好才会生效，保存后下一次对话即生效。
            </p>

            <div className="card-foot">
              <span className="profile-hint">{llm?.model ?? "-"}</span>
              <div className="advanced-actions">
                <button className="btn-ghost btn-sm" onClick={() => void clear()} disabled={saving}>
                  清除
                </button>
                <button
                  className="btn-primary btn-sm"
                  onClick={() => void save()}
                  disabled={saving}
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            </div>

            {error !== null && <p className="profile-hint error">{error}</p>}
          </div>
        )}
      </section>

      {onNavigateSecondary !== undefined && (
        <section className="card">
          <div className="card-head">
            <div>
              <div className="card-title">更多</div>
              <div className="card-sub">移动端从这里进入预算与记忆</div>
            </div>
          </div>
          <div className="quick-links">
            <button className="quick-link" onClick={() => onNavigateSecondary("budget")}>
              <span>💰</span>
              <b>预算管理</b>
              <small>给每类花钱定个上限</small>
            </button>
            <button className="quick-link" onClick={() => onNavigateSecondary("memory")}>
              <span>🧠</span>
              <b>我的记忆</b>
              <small>看看它记住了什么</small>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
