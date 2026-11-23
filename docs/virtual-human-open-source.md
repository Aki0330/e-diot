# 虚拟人：可直接复用的开源项目调研

> 日期：2026-11-23　结论：**不做自研，直接复用 Open-LLM-VTuber（MIT）**
> 目标：在 E-diot 里加一个能说话、有 Live2D 形象、能接我们记账 Agent 的虚拟人，2–5 天出 demo。

## 0. 一句话结论

用 **[Open-LLM-VTuber/Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber)**：

- 14.8k star，**MIT**（只有自带 Live2D 示例模型另算）；
- Windows 可跑，Python 3.10–3.12 + uv；默认 **Edge TTS（中文）** + sherpa-onnx ASR，**不需要 GPU**；
- 自带 Live2D 形象、语音打断、嘴型、桌面宠物模式；
- 支持任何 **OpenAI 兼容 API**（含 DeepSeek），可以指向我们自己的 E-diot 适配层。

前端先用 iframe/独立页接入（1 天），再把它的 Live2D 组件抄进 E-diot（2–3 天）。

## 1. 候选项目对比

| 项目 | Star | 许可证 | 技术栈 | 形象 | 中文 TTS | 需要 GPU | 适合我们吗 |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) | 14.8k | **MIT**（示例模型除外） | Python + Web | Live2D（Cubism 5） | Edge TTS / Azure / GPT-SoVITS / CosyVoice | 否（可全 API） | **首选** |
| [AITuberKit](https://github.com/tegnike/aituber-kit) | 1.1k | **自定义：非商用免费，商用要授权** | TypeScript / Next.js | VRM 3D + Live2D | Google / OpenAI / ElevenLabs 等（中文需选对音色） | 否 | 想要 3D VRM 时用；注意许可证 |
| [pixiv/ChatVRM](https://github.com/pixiv/ChatVRM) | 848 | **MIT**（已归档） | Next.js + three-vrm | VRM 3D | Koeiromap / OpenAI | 否 | 代码参考；已停止维护 |
| [LiveTalking](https://github.com/lipku/LiveTalking) | 10.7k | Apache-2.0 | Python + 视频流 | 真人视频数字人（ernerf/musetalk/wav2lip） | 任意 TTS | **是（NVIDIA）** | 发布会/大屏才考虑，日常不划算 |
| [live2d-widget](https://github.com/stevenjoezhang/live2d-widget) | 11k | **GPL-3.0** | TypeScript | Live2D | 无 | 否 | 只想要看板娘时用；GPL 会传染 |
| [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) | 1.5k | MIT | TypeScript | Live2D | 无 | 否 | 自己写时的底层库 |
| [three-vrm](https://github.com/pixiv/three-vrm) | 2.3k | MIT | TypeScript | VRM 3D | 无 | 否 | 自己写 3D 时的底层库 |
| [AI-Vtuber](https://github.com/Ikaros-521/AI-Vtuber) | 4.6k | **GPL-3.0** | Python | Live2D | 多引擎 | 否 | 功能全但 GPL，不建议抄进仓库 |

## 2. 为什么不选另外几个

- **AITuberKit**：最像「网页版数字人」，VRM/Live2D 都有，但 v2.0 起是**自定义许可证**：非商用免费，商用要单独授权；另外 TTS 生态偏日语（VOICEVOX、Koeiromap、Style-BERT-VITS2），中文要接 Google/OpenAI/ElevenLabs。
- **ChatVRM**：MIT 很香，但 2024 年已归档，TTS 依赖 Koeiromap（日语），只适合当代码参考。
- **LiveTalking**：实时视频数字人，效果最好，但要 NVIDIA GPU + 视频生成，部署和演示成本都高，不适合现在的笔记本。
- **AI-Vtuber / live2d-widget**：GPL-3.0，抄进我们的 MIT/私有仓库会带来许可证污染；只适合单独进程/单独仓库调用。

## 3. 推荐方案：Open-LLM-VTuber + E-diot 适配层

### 3.1 它已经有什么

- Live2D 形象（Cubism 5）、表情、触摸反馈、桌宠模式；
- 实时语音对话、语音打断、AI 主动说话；
- TTS：Edge TTS、Azure TTS、GPT-SoVITS、CosyVoice、Fish Audio 等；
- ASR：sherpa-onnx、FunASR、Whisper 等；
- LLM：Ollama、OpenAI 兼容、DeepSeek、Gemini、Claude、智谱等；
- 配置全在 `conf.yaml`，不用改代码就能换模型/声音/形象。

### 3.2 在我们机器上的安装步骤

前置：Python **3.10–3.12**（当前机器只有 3.14，需另装）、FFmpeg、Git（已装）。

```powershell
winget install --id Python.Python.3.11 -e
winget install --id Gyan.FFmpeg -e
# 重新开一个终端
git clone https://github.com/Open-LLM-VTuber/Open-LLM-VTuber.git C:\Users\linhanyu\Desktop\cyberbudget\Open-LLM-VTuber
cd C:\Users\linhanyu\Desktop\cyberbudget\Open-LLM-VTuber
# 国内网络：在 pyproject.toml 末尾加阿里源
# [[tool.uv.index]]
# url = "https://mirrors.aliyun.com/pypi/simple"
# default = true
uv sync
uv run run_server.py
# 浏览器打开 http://localhost:12393
```

`conf.yaml` 关键项（先用 DeepSeek 直连跑通，再接我们的适配层）：

```yaml
llm_provider: openai_compatible_llm
llm_configs:
  openai_compatible_llm:
    base_url: https://api.deepseek.com/v1
    model: deepseek-chat
    api_key: <你的 DeepSeek Key>
    temperature: 0.7
```

### 3.3 接到 E-diot 的 Agent（关键一步）

虚拟人默认有自己的 LLM，这样它不知道我们的预算、账单和记忆。要让它「用我们的脑子」，在 E-diot 加一个 OpenAI 兼容端点：

```text
POST /v1/chat/completions
body: { model, messages: [{role:"user", content:"今天午饭花了38"}] }
→ 取最后一条 user 消息
→ app.agent.runWithTrace(demoUserId, message)
→ 返回 { choices:[{ message:{ role:"assistant", content: response } }] }
```

然后把 `conf.yaml` 的 `base_url` 指向 `http://127.0.0.1:8000/v1`，`model` 随便写（如 `cyberbudget`），`api_key` 填本地占位值。这样虚拟人说的每句话都会走我们的记账 Agent、预算检查和记忆。

> 这一步约 0.5 天；`/v1/chat/completions` 放在 `/api/v1` 之外，避免和现有鉴权冲突，内部固定一个 demo 用户即可。

### 3.4 放进 E-diot 的两种方式

| 方式 | 工作量 | 说明 |
| --- | --- | --- |
| **iframe / 新标签页**（先做） | 0.5 天 | E-diot 加一个「数字人」入口，`<iframe src="http://localhost:12393">`；最快看到效果 |
| 抄它的前端组件（后做） | 2–3 天 | 复用 `Open-LLM-VTuber-Web` 的 Live2D 渲染与 WebSocket 协议，嵌进 React 页面，去掉它自带的聊天 UI |

建议先 iframe 验证「语音 + 形象 + 打断」，确认体验后再抄组件。

## 4. 许可证注意事项

- **Open-LLM-VTuber**：代码 MIT，可改可商用；但**自带的 Live2D 示例模型**受 Live2D 免费素材协议约束，商用需换模型或取得授权。
- **AITuberKit**：非商用免费；如果项目以后商业化，需要单独购买商用授权。
- **ChatVRM**：MIT，可抄；但已归档。
- **LiveTalking**：Apache-2.0，商用友好；但要 GPU。
- **AI-Vtuber / live2d-widget**：GPL-3.0，**不要把代码复制进仓库**，最多单独进程调用。

## 5. 建议的 5 天计划

| 天 | 做什么 | 验收 |
| --- | --- | --- |
| D1 | 装 Python 3.11 + FFmpeg，跑通 Open-LLM-VTuber（DeepSeek 直连） | 浏览器里能说话、有 Live2D、嘴会动 |
| D2 | E-diot 加 `/v1/chat/completions` 适配层 | 虚拟人回答里能出现「餐饮预算还剩 …」 |
| D3 | E-diot 加「数字人」入口（iframe） | 从主应用一键进入，不用记端口 |
| D4 | 换形象、调 TTS 音色、加「关闭/静音」按钮 | 可一键关闭；刷新后配置不丢 |
| D5 | 录 30 秒 demo，写进汇报 | 能演示「说一句 → 记账 → 语音回复」 |

## 6. 风险

- 中文 TTS：默认 Edge TTS 免费、够用；商用建议换 Azure/火山，注意额度。
- 麦克风：非 localhost 访问需要 HTTPS，否则浏览器不给麦克风权限。
- 延迟：ASR + LLM + TTS 叠加，首包 1–2 秒属正常；先用文字流式 + 语音后到。
- Live2D 模型版权：示例模型只适合演示，正式发布换自制/授权模型。
- Python 版本：项目要求 3.10–3.12，不能用系统里的 3.14。

## 7. 参考

- Open-LLM-VTuber：<https://github.com/Open-LLM-VTuber/Open-LLM-VTuber>
- 快速开始：<https://docs.llmvtuber.com/docs/quick-start>
- 前端仓库：<https://github.com/Open-LLM-VTuber/Open-LLM-VTuber-Web>
- AITuberKit：<https://github.com/tegnike/aituber-kit>
- ChatVRM：<https://github.com/pixiv/ChatVRM>
- LiveTalking：<https://github.com/lipku/LiveTalking>
- Live2D Web SDK：<https://www.live2d.com/en/sdk/>
