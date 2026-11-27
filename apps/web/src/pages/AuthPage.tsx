import { useRef, useState, type FormEvent } from "react";

import { api, setTokens } from "../api/client.js";
import { BrandMark } from "../components/Topbar.js";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const [account, setAccount] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [reg, setReg] = useState({ username: "", phone: "", email: "", password: "" });
  const phoneRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const registering = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (registering && !reg.phone.trim() && !reg.email.trim()) {
      setError("请填写手机号或邮箱，方便下次登录。");
      phoneRef.current?.focus();
      return;
    }
    setError("");
    setBusy(true);
    try {
      const data = registering
        ? await api.register({
            username: reg.username.trim(),
            ...(reg.phone.trim() && { phone_num: reg.phone.trim() }),
            ...(reg.email.trim() && { email: reg.email.trim() }),
            password: reg.password,
          })
        : await api.login(account.trim(), loginPassword);
      setTokens(data.access_token, data.refresh_token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法连接，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(registering ? "login" : "register");
    setError("");
    setVisible(false);
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  return (
    <main id="auth-page" className="entry-page">
      <header className="entry-mast">
        <BrandMark />
        <span className="entry-wordmark" lang="en">
          e-diot
        </span>
        <span className="entry-product">随身账本</span>
      </header>
      <div className="entry-spread">
        <aside className="entry-photo" aria-label="一句话记账示例">
          <div className="entry-photo-copy">
            <h2>说一句，记一笔。</h2>
            <p>试试「午饭花了 32 元」。</p>
          </div>
        </aside>
        <section className="entry-access" aria-labelledby="entry-title">
          <div className="entry-form-panel">
            <h1 id="entry-title" ref={headingRef} tabIndex={-1}>
              {registering ? "创建账号" : "登录账本"}
            </h1>
            <form
              id={registering ? "register-form" : "login-form"}
              className="entry-form"
              onSubmit={(event) => void submit(event)}
              onChange={() => error && setError("")}
              aria-busy={busy}
            >
              {registering ? (
                <>
                  <label className="entry-field">
                    <span>用户名</span>
                    <input
                      name="username"
                      autoComplete="username"
                      placeholder="3 至 50 个字符"
                      minLength={3}
                      maxLength={50}
                      required
                      value={reg.username}
                      onChange={(e) => setReg({ ...reg, username: e.target.value })}
                    />
                  </label>
                  <fieldset className="entry-contacts">
                    <legend>
                      联系方式<span>至少填写一项</span>
                    </legend>
                    <label className="entry-field">
                      <span>手机号</span>
                      <input
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        pattern={"\\+?[0-9]{7,15}"}
                        title="7 至 15 位数字，可加国家或地区码"
                        ref={phoneRef}
                        value={reg.phone}
                        onChange={(e) => setReg({ ...reg, phone: e.target.value })}
                      />
                    </label>
                    <label className="entry-field">
                      <span>邮箱</span>
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={reg.email}
                        onChange={(e) => setReg({ ...reg, email: e.target.value })}
                      />
                    </label>
                  </fieldset>
                </>
              ) : (
                <label className="entry-field">
                  <span>手机号或邮箱</span>
                  <input
                    name="account"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="输入注册时使用的账号"
                    required
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                  />
                </label>
              )}
              <div className="entry-field">
                <label htmlFor="entry-password">密码</label>
                <div className="entry-password">
                  <input
                    id="entry-password"
                    name="password"
                    type={visible ? "text" : "password"}
                    required
                    autoComplete={registering ? "new-password" : "current-password"}
                    minLength={registering ? 6 : undefined}
                    maxLength={registering ? 128 : undefined}
                    placeholder={registering ? "至少 6 个字符" : "输入密码"}
                    value={registering ? reg.password : loginPassword}
                    onChange={(e) =>
                      registering
                        ? setReg({ ...reg, password: e.target.value })
                        : setLoginPassword(e.target.value)
                    }
                  />
                  <button
                    type="button"
                    aria-label={visible ? "隐藏密码" : "显示密码"}
                    aria-controls="entry-password"
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? "隐藏" : "显示"}
                  </button>
                </div>
              </div>
              {error && (
                <p className="entry-error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="entry-submit" disabled={busy}>
                {busy
                  ? registering
                    ? "正在创建…"
                    : "正在登录…"
                  : registering
                    ? "创建账号"
                    : "登录"}
              </button>
            </form>
            <p className="entry-switch">
              {registering ? "已有账号？" : "还没有账号？"}
              <button type="button" disabled={busy} onClick={switchMode}>
                {registering ? "去登录" : "创建账号"}
              </button>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
