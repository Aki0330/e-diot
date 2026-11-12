import { useState, type FormEvent } from "react";

import { api, setToken } from "../api/client.js";
import { useToast } from "../components/Toast.js";

/** 登录 / 注册页（对应旧 `#auth-page` 与 index.html 里的两个表单） */
export function AuthPage({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const toast = useToast();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);

  const [account, setAccount] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [reg, setReg] = useState({ username: "", phone: "", email: "", password: "" });

  const submitLogin = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api.login(account.trim(), loginPassword);
      setToken(data.access_token);
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
      setToken(data.access_token);
      await onAuthenticated();
    } catch (error) {
      toast(error instanceof Error ? error.message : "注册失败", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="auth-page" className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">💸</div>
        <h1 className="auth-title">e-diot</h1>
        <p className="auth-subtitle">智能记账 · 轻松理财</p>

        {mode === "login" ? (
          <form id="login-form" className="auth-form" onSubmit={(event) => void submitLogin(event)}>
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
            <div className="input-group">
              <span className="input-icon">🔒</span>
              <input
                type="password"
                placeholder="密码"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                required
              />
            </div>
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
            <div className="input-group">
              <span className="input-icon">👤</span>
              <input
                type="text"
                placeholder="用户名"
                value={reg.username}
                onChange={(event) => setReg({ ...reg, username: event.target.value })}
                required
              />
            </div>
            <div className="input-group">
              <span className="input-icon">📱</span>
              <input
                type="text"
                placeholder="手机号"
                value={reg.phone}
                onChange={(event) => setReg({ ...reg, phone: event.target.value })}
              />
            </div>
            <div className="input-group">
              <span className="input-icon">📧</span>
              <input
                type="email"
                placeholder="邮箱"
                value={reg.email}
                onChange={(event) => setReg({ ...reg, email: event.target.value })}
              />
            </div>
            <div className="input-group">
              <span className="input-icon">🔒</span>
              <input
                type="password"
                placeholder="密码（至少6位）"
                value={reg.password}
                onChange={(event) => setReg({ ...reg, password: event.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn-primary btn-block" disabled={busy}>
              {busy ? "注册中…" : "注 册"}
            </button>
          </form>
        )}

        <p className="auth-toggle">
          <span onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "还没有账号？立即注册 →" : "已有账号？去登录 →"}
          </span>
        </p>
        <p className="auth-hint">💡 注册后自动获得 5000 元体验额度</p>
      </div>
    </div>
  );
}
