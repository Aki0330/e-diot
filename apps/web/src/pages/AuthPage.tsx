import { useState, type FormEvent } from "react";

import { api, setTokens } from "../api/client.js";
import { AvatarPicker } from "../components/AvatarPicker.js";
import { useToast } from "../components/Toast.js";
import { getAvatar, setAvatar } from "../utils/avatar.js";

/** 登录页的卖点：直接用「用户会遇到的事」说，不写功能清单 */
const POINTS: readonly { icon: string; title: string; desc: string }[] = [
  {
    icon: "🗣️",
    title: "一句话就记好",
    desc: "「昨天打车 26」——不用挑分类、不用填表格。",
  },
  {
    icon: "🎯",
    title: "预算有人帮你盯",
    desc: "快到上限时提前说一声，不让你月底才发现。",
  },
  {
    icon: "💚",
    title: "越用越合拍",
    desc: "记住你的口味和边界，提醒只在合适的时候来。",
  },
];

/** 登录 / 注册页 */
export function AuthPage({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);

  const [account, setAccount] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [reg, setReg] = useState({ username: "", phone: "", email: "", password: "" });
  const [avatar, setAvatarState] = useState<string>(() => getAvatar());

  const submitLogin = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api.login(account.trim(), loginPassword);
      setTokens(data.access_token, data.refresh_token);
      await onAuthenticated();
    } catch (error) {
      toast(error instanceof Error ? error.message : "登录失败", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitRegister = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (reg.phone.trim() === "" && reg.email.trim() === "") {
      toast("手机号和邮箱至少填一个", "error");
      return;
    }
    setBusy(true);
    try {
      const data = await api.register({
        username: reg.username.trim(),
        ...(reg.phone.trim() === "" ? {} : { phone_num: reg.phone.trim() }),
        ...(reg.email.trim() === "" ? {} : { email: reg.email.trim() }),
        password: reg.password,
      });
      setTokens(data.access_token, data.refresh_token);
      setAvatar(avatar);
      await onAuthenticated();
    } catch (error) {
      toast(error instanceof Error ? error.message : "注册失败", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="auth-page" className="auth-page">
      <div className="auth-shell">
        {/* 左：品牌与产品能力（手机端收起细节） */}
        <aside className="auth-brand">
          <div className="auth-brand-top">
            <span className="auth-mark">💸</span>
            <div className="auth-wordmark">
              e-diot<span>智账</span>
              <small>SMART LEDGER</small>
            </div>
          </div>

          <h1 className="auth-headline">
            说一句话，
            <br />
            账就记好了。
          </h1>
          <p className="auth-lede">不用挑分类，也不用填表。日常怎么说话，就怎么记账。</p>

          <ul className="auth-points">
            {POINTS.map((point) => (
              <li key={point.title}>
                <span className="ap-icon">{point.icon}</span>
                <div>
                  <b>{point.title}</b>
                  <p>{point.desc}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="auth-demo" aria-hidden="true">
            <span className="auth-demo-label">比如这样记</span>
            <div className="auth-demo-bubble user">昨天和朋友吃火锅 168</div>
            <div className="auth-demo-bubble bot">
              记好了 · 餐饮 <b>¥168</b>
              <small>本月餐饮还剩 ¥432，节奏刚好</small>
            </div>
          </div>
        </aside>

        {/* 右：登录/注册 */}
        <section className="auth-card">
          <div className="auth-card-head">
            <h2>{mode === "login" ? "欢迎回来" : "先认识一下"}</h2>
            <p>{mode === "login" ? "继续记录你的日常。" : "30 秒建好账户，马上记第一笔。"}</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="登录或注册">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={mode === "login" ? "on" : ""}
              onClick={() => setMode("login")}
            >
              登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={mode === "register" ? "on" : ""}
              onClick={() => setMode("register")}
            >
              注册
            </button>
          </div>

          {mode === "login" ? (
            <form
              id="login-form"
              className="auth-form"
              onSubmit={(event) => void submitLogin(event)}
            >
              <label className="field">
                <span className="field-label">账号</span>
                <div className="input-group">
                  <span className="input-icon">📱</span>
                  <input
                    type="text"
                    placeholder="手机号或邮箱"
                    value={account}
                    onChange={(event) => setAccount(event.target.value)}
                    required
                  />
                </div>
              </label>
              <label className="field">
                <span className="field-label">密码</span>
                <div className="input-group">
                  <span className="input-icon">🔒</span>
                  <input
                    type="password"
                    placeholder="输入密码"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    required
                  />
                </div>
              </label>
              <button type="submit" className="btn-primary btn-block" disabled={busy}>
                {busy ? "登录中…" : "登 录"}
              </button>
            </form>
          ) : (
            <form
              id="register-form"
              className="auth-form"
              onSubmit={(event) => void submitRegister(event)}
            >
              <AvatarPicker
                value={avatar}
                onChange={(emoji) => setAvatarState(emoji)}
                label="挑一个记账搭子"
                hint="之后随时能换"
              />

              <label className="field">
                <span className="field-label">用户名</span>
                <div className="input-group">
                  <span className="input-icon">👤</span>
                  <input
                    type="text"
                    placeholder="怎么称呼你"
                    value={reg.username}
                    onChange={(event) => setReg({ ...reg, username: event.target.value })}
                    required
                  />
                </div>
              </label>
              <label className="field">
                <span className="field-label">手机号</span>
                <div className="input-group">
                  <span className="input-icon">📱</span>
                  <input
                    type="text"
                    placeholder="手机号（和邮箱二选一）"
                    value={reg.phone}
                    onChange={(event) => setReg({ ...reg, phone: event.target.value })}
                  />
                </div>
              </label>
              <label className="field">
                <span className="field-label">邮箱</span>
                <div className="input-group">
                  <span className="input-icon">📧</span>
                  <input
                    type="email"
                    placeholder="邮箱（和手机号二选一）"
                    value={reg.email}
                    onChange={(event) => setReg({ ...reg, email: event.target.value })}
                  />
                </div>
              </label>
              <label className="field">
                <span className="field-label">密码</span>
                <div className="input-group">
                  <span className="input-icon">🔒</span>
                  <input
                    type="password"
                    placeholder="至少 6 位"
                    value={reg.password}
                    onChange={(event) => setReg({ ...reg, password: event.target.value })}
                    required
                  />
                </div>
              </label>
              <button type="submit" className="btn-primary btn-block" disabled={busy}>
                {busy ? "注册中…" : "开始记账"}
              </button>
            </form>
          )}

          <p className="auth-toggle">
            <span onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? "还没有账号？去注册 →" : "已有账号？直接登录 →"}
            </span>
          </p>
          <p className="auth-hint">🎁 注册即得 ¥5,000 体验预算，先随便记两笔试试</p>
        </section>
      </div>
    </div>
  );
}
