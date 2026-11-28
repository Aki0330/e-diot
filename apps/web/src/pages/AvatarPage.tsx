import { useEffect, useRef, useState } from "react";

import { api } from "../api/client.js";
import type { CitationItem } from "../api/types.js";
import "./avatar.css";

type AvatarStatus = "idle" | "thinking" | "talking";

interface Turn {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly citations?: readonly CitationItem[];
}

const STATUS_LABEL: Record<AvatarStatus, string> = {
  idle: "待机",
  thinking: "思考中",
  talking: "说话中",
};

const QUICK_PROMPTS = ["今天午饭花了 38", "这个月还剩多少预算", "怎么才能少花点"];

/**
 * 数字人原型页。
 *
 * 现在接的是「浏览器语音 + 现有 /api/v1/chat」：
 * - 对话：走我们的记账 Agent，预算 / 记忆 / 知识库引用都能回来；
 * - 语音：先用 Web Speech API，后续换成 Edge/Azure TTS；
 * - 形象：SVG 占位，后续把 <AvatarFigure> 换成 Live2D / VRM 渲染层即可。
 */
export function AvatarPage({ active }: { readonly active: boolean }) {
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AvatarStatus>("idle");
  const [ttsOn, setTtsOn] = useState(true);
  const [error, setError] = useState("");
  const sessionRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const speakingRef = useRef(false);

  useEffect(() => {
    if (!active && typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
      speakingRef.current = false;
      setStatus("idle");
    }
  }, [active]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  function speak(text: string): void {
    const synth: SpeechSynthesis | undefined =
      typeof window === "undefined" ? undefined : window.speechSynthesis;
    if (synth === undefined) {
      setStatus("talking");
      globalThis.setTimeout(() => setStatus("idle"), Math.min(6000, 800 + text.length * 90));
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.02;
    utterance.pitch = 1;
    const voices = synth.getVoices();
    const zh = voices.find((voice) => voice.lang.toLowerCase().startsWith("zh"));
    if (zh !== undefined) utterance.voice = zh;
    utterance.onstart = () => {
      speakingRef.current = true;
      setStatus("talking");
    };
    utterance.onend = () => {
      speakingRef.current = false;
      setStatus("idle");
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      setStatus("idle");
    };
    synth.speak(utterance);
  }

  async function send(text: string): Promise<void> {
    const message = text.trim();
    if (message === "" || busy) return;
    setError("");
    setBusy(true);
    setStatus("thinking");
    setInput("");
    setTurns((prev) => [...prev, { role: "user", text: message }]);
    try {
      const reply = await api.chat(message, sessionRef.current);
      sessionRef.current = reply.session_id;
      setTurns((prev) => [
        ...prev,
        { role: "assistant", text: reply.response, citations: reply.citations },
      ]);
      setBusy(false);
      if (ttsOn) speak(reply.response);
      else setStatus("idle");
    } catch (err) {
      setBusy(false);
      setStatus("idle");
      setError(err instanceof Error ? err.message : "请求失败，请稍后再试");
    }
  }

  return (
    <div className="avatar-page">
      <header className="avatar-head">
        <div>
          <p className="avatar-eyebrow">E-DIOT · AVATAR LAB</p>
          <h1>数字人 · 记账助手</h1>
          <p className="avatar-sub">
            对话和语音已经接上；形象是占位，后续把左图换成 Live2D / VRM 即可。
          </p>
        </div>
        <div className="avatar-head-actions">
          <button
            type="button"
            className={`avatar-tts${ttsOn ? " on" : ""}`}
            onClick={() => {
              setTtsOn((value) => !value);
              if (ttsOn) window.speechSynthesis?.cancel();
            }}
          >
            {ttsOn ? "🔊 语音开" : "🔇 语音关"}
          </button>
        </div>
      </header>

      <div className="avatar-layout">
        <section className={`avatar-stage ${status}`} aria-label="数字人形象">
          <AvatarFigure />
          <div className="avatar-stage-foot">
            <span className="avatar-badge">{STATUS_LABEL[status]}</span>
            <span className="avatar-hint">原型形象 · 可替换为 Live2D</span>
          </div>
        </section>

        <section className="avatar-chat">
          <div className="avatar-chat-head">
            <b>对话</b>
            <span>{turnCountLabel(turns.length)}</span>
          </div>

          <div className="avatar-turns" ref={listRef}>
            {turns.length === 0 && (
              <div className="avatar-empty">
                <p>说一句「午饭花了 38」，它会记下来，并念给你听。</p>
                <div className="avatar-quick">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button key={prompt} type="button" onClick={() => void send(prompt)}>
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn, index) => (
              <div key={`${index}-${turn.role}`} className={`avatar-turn ${turn.role}`}>
                <div className="avatar-bubble">{turn.text}</div>
                {turn.citations !== undefined && turn.citations.length > 0 && (
                  <ul className="avatar-citations">
                    {turn.citations.slice(0, 3).map((citation) => (
                      <li key={`${citation.category}-${citation.content.slice(0, 12)}`}>
                        <b>{citation.category}</b>
                        {citation.content.slice(0, 80)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {busy && <div className="avatar-typing">正在想怎么回…</div>}
            {error !== "" && <div className="avatar-error">{error}</div>}
          </div>

          <form
            className="avatar-input"
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="说一句话，比如「午饭花了 38」"
              disabled={busy}
            />
            <button type="submit" disabled={busy || input.trim() === ""}>
              发送
            </button>
          </form>
          <p className="avatar-footnote">
            语音先用浏览器 Web Speech；形象渲染层预留了 Live2D / VRM 接口。
          </p>
        </section>
      </div>
    </div>
  );
}

function turnCountLabel(count: number): string {
  return count === 0 ? "还没开始" : `${String(count)} 条`;
}

function AvatarFigure() {
  return (
    <svg className="avatar-figure" viewBox="0 0 360 440" role="img" aria-label="数字人原型">
      <defs>
        <linearGradient id="avatar-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c332b" />
          <stop offset="100%" stopColor="#1c211d" />
        </linearGradient>
        <linearGradient id="avatar-jacket" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a4138" />
          <stop offset="100%" stopColor="#252b25" />
        </linearGradient>
      </defs>
      <rect width="360" height="440" rx="24" fill="url(#avatar-bg)" />
      <circle cx="180" cy="126" r="118" fill="#c9f26b" opacity="0.08" />
      <ellipse cx="180" cy="392" rx="92" ry="16" fill="#0f1310" opacity="0.55" />

      <g className="avatar-breathe">
        <path d="M78 440c0-84 44-128 102-128s102 44 102 128Z" fill="url(#avatar-jacket)" />
        <path d="M150 312l30 38 30-38 16 12-46 58-46-58Z" fill="#c9f26b" opacity="0.85" />

        <ellipse cx="180" cy="230" rx="18" ry="20" fill="#e9c6a8" />
        <circle cx="180" cy="176" r="78" fill="#f1d3b8" />
        <path
          d="M102 168c0-56 34-86 78-86s78 30 78 86c-14-28-38-42-78-42s-64 14-78 42Z"
          fill="#242a25"
        />
        <path d="M104 166c2 30 10 48 20 60-22-10-30-34-20-60Z" fill="#242a25" />
        <path d="M256 166c-2 30-10 48-20 60 22-10 30-34 20-60Z" fill="#242a25" />

        <g className="avatar-eyes">
          <ellipse cx="152" cy="178" rx="7" ry="10" fill="#242a25" />
          <ellipse cx="208" cy="178" rx="7" ry="10" fill="#242a25" />
          <circle cx="154" cy="175" r="2.2" fill="#f6f3ea" />
          <circle cx="210" cy="175" r="2.2" fill="#f6f3ea" />
        </g>

        <ellipse cx="180" cy="214" rx="4" ry="3" fill="#d9a98b" opacity="0.8" />
        <ellipse className="avatar-mouth" cx="180" cy="232" rx="19" ry="5.5" fill="#8d4a43" />
      </g>

      <text x="24" y="36" fill="#c9f26b" fontSize="13" letterSpacing="3" fontFamily="monospace">
        E-DIOT AVATAR
      </text>
    </svg>
  );
}
