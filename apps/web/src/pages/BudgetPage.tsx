import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client.js";
import type { DashboardData } from "../api/types.js";
import { Modal } from "../components/Modal.js";
import { useToast } from "../components/Toast.js";
import { catEmoji, fmt } from "../utils/format.js";

type ModalKind = "ai" | "manual" | "total" | null;

interface ManualRow {
  readonly category: string;
  readonly amount: string;
}

export interface BudgetPageProps {
  readonly active: boolean;
  readonly refreshKey: number;
}

/** 预算页 + 3 个弹窗（对应旧 initBudgetPage / showAiBudgetModal / showManualBudgetModal / showTotalBudgetModal） */
export function BudgetPage({ active, refreshKey }: BudgetPageProps) {
  const toast = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  const [aiInput, setAiInput] = useState("");
  const [totalInput, setTotalInput] = useState("");
  const [manualRows, setManualRows] = useState<readonly ManualRow[]>([
    { category: "", amount: "" },
  ]);

  const load = useCallback(async (): Promise<void> => {
    try {
      setData(await api.dashboard());
    } catch {
      // 顶部状态卡片会显示失败态
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, refreshKey, load]);

  const closeModal = (): void => {
    setModal(null);
    setAiInput("");
    setTotalInput("");
    setManualRows([{ category: "", amount: "" }]);
  };

  const submitAi = async (): Promise<void> => {
    const text = aiInput.trim();
    if (text === "") throw new Error("请输入预算描述");
    await api.agentBudget(text);
    toast("预算分配成功！", "success");
    await load();
  };

  const submitManual = async (): Promise<void> => {
    const categories = manualRows.map((row) => ({
      category: row.category.trim(),
      monthly_limit: Number(row.amount),
    }));
    if (
      categories.length === 0 ||
      categories.some(
        (row) =>
          row.category === "" || !Number.isFinite(row.monthly_limit) || row.monthly_limit <= 0,
      )
    ) {
      throw new Error("请填写完整的分类和金额");
    }
    await api.manualBudget(categories);
    toast("预算分配成功！", "success");
    await load();
  };

  const submitTotal = async (): Promise<void> => {
    const value = Number(totalInput);
    if (!Number.isFinite(value) || value <= 0) throw new Error("请输入有效的预算金额");
    await api.setBudget(value);
    toast("总预算已更新！", "success");
    await load();
  };

  const allocated =
    data === null ? 0 : data.categories.reduce((sum, category) => sum + (category.budget || 0), 0);

  if (data === null) {
    return (
      <div className="page">
        <div className="empty">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const usage =
    data.total_budget > 0 ? Math.round((data.total_spent / data.total_budget) * 100) : 0;
  const rows = [...data.categories].sort((a, b) => b.percentage - a.percentage);
  const allocatedRows = rows.filter((row) => row.budget > 0);
  const overCount = rows.filter((row) => row.percentage >= 100).length;
  const nearCount = rows.filter((row) => row.percentage >= 80 && row.percentage < 100).length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">BUDGET · {data.year_month}</p>
          <h2 className="page-title">预算</h2>
          <p className="page-desc">每笔记账都会回到这里检查一次额度，进度按统一三态着色。</p>
        </div>
        <div className="head-side">
          <button className="btn-secondary" onClick={() => setModal("total")}>
            ⚙️ 总预算
          </button>
          <button className="btn-primary" onClick={() => setModal("ai")}>
            🤖 AI 分配
          </button>
        </div>
      </div>

      <div className="budget-top">
        <div className="bt-cell">
          <div className="bt-k">月总预算 / TOTAL</div>
          <div className="bt-v num">¥{fmt(data.total_budget)}</div>
          <div className="bt-note">
            已分配 ¥{fmt(allocated)} · 未分配 ¥{fmt(Math.max(data.total_budget - allocated, 0))}
          </div>
        </div>
        <div className="bt-cell">
          <div className="bt-k">已支出 / SPENT</div>
          <div className="bt-v num">¥{fmt(data.total_spent)}</div>
          <div className="bt-note">
            剩余 ¥{fmt(data.remaining)} · 使用率 {usage}%
          </div>
        </div>
        <div className="bt-cell">
          <div className="bt-k">分类额度 / CATEGORIES</div>
          <div className="bt-v num">{allocatedRows.length}</div>
          <div className="bt-note">
            {overCount} 项超支 · {nearCount} 项接近上限
          </div>
        </div>
        <div className="bt-bar-wrap">
          <div className="bt-bar">
            {allocatedRows.map((row) => (
              <div
                key={row.category}
                className="bt-seg"
                style={{
                  width: `${allocated > 0 ? (row.budget / allocated) * 100 : 0}%`,
                }}
                title={`${row.category} ¥${fmt(row.budget)}`}
              />
            ))}
          </div>
          <div className="bt-legend">
            {allocatedRows.map((row) => (
              <span className="legend-item" key={row.category}>
                <i className="legend-swatch" style={{ background: "var(--primary)" }} />
                {row.category} ¥{fmt(row.budget)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="budget-list">
        <div className="bl-head">
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className="bl-title">分类预算</span>
            {overCount > 0 && <span className="badge red">{overCount} 项超支</span>}
            {nearCount > 0 && <span className="badge amber">{nearCount} 项接近上限</span>}
          </div>
          <button className="btn-text" onClick={() => setModal("manual")}>
            ✏️ 手动编辑
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="empty" style={{ border: 0, boxShadow: "none" }}>
            <div className="empty-icon">📋</div>
            <div className="empty-title">还没有分配分类预算</div>
            <p className="empty-desc">可以用 AI 自然语言分配，或手动编辑分类额度。</p>
          </div>
        ) : (
          rows.map((row) => (
            <div className="brow" key={row.category}>
              <div className="icon-tile">{catEmoji(row.category)}</div>
              <div className="brow-main">
                <div className="brow-name">{row.category}</div>
                <div className="brow-sub">月度额度</div>
              </div>
              <div className="brow-mid">
                <div className="brow-amounts">
                  <span className="brow-spent">
                    ¥{fmt(row.spent)}
                    <span>/ ¥{fmt(row.budget)}</span>
                  </span>
                  <span>剩余 ¥{fmt(Math.max(row.budget - row.spent, 0))}</span>
                </div>
                <div
                  className={`bar${row.percentage >= 100 ? " red" : row.percentage >= 80 ? " amber" : ""}`}
                >
                  <span style={{ width: `${Math.min(row.percentage, 100)}%` }} />
                </div>
              </div>
              <div className="brow-right">
                <span className="brow-pct">{Math.round(row.percentage)}%</span>
                <span className="brow-state">
                  {row.percentage >= 100 ? "超支" : row.percentage >= 80 ? "接近上限" : "正常"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="profile-hint" style={{ marginTop: 10 }}>
        校验通过：分类合计 ¥{fmt(allocated)}，月总预算 ¥{fmt(data.total_budget)}。
      </p>

      {modal === "ai" && (
        <Modal title="AI 智能分配预算" onClose={closeModal} onConfirm={submitAi}>
          <div className="form-group">
            <label>用自然语言描述你的预算分配</label>
            <textarea
              rows={3}
              placeholder="例如：餐饮2000，交通500，购物1000，娱乐500"
              value={aiInput}
              onChange={(event) => setAiInput(event.target.value)}
            />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            💡 AI会自动提取分类和金额，与已有分配合并，并确保不超过总预算
          </p>
        </Modal>
      )}

      {modal === "manual" && (
        <Modal title="手动分配预算" onClose={closeModal} onConfirm={submitManual}>
          <div>
            {manualRows.map((row, index) => (
              <div key={index} className="form-group">
                <label>分类</label>
                <input
                  placeholder="如 餐饮"
                  value={row.category}
                  onChange={(event) =>
                    setManualRows((rows) =>
                      rows.map((item, i) =>
                        i === index ? { ...item, category: event.target.value } : item,
                      ),
                    )
                  }
                />
                <label style={{ marginTop: 8 }}>金额</label>
                <input
                  type="number"
                  placeholder="如 2000"
                  min={0}
                  step={100}
                  value={row.amount}
                  onChange={(event) =>
                    setManualRows((rows) =>
                      rows.map((item, i) =>
                        i === index ? { ...item, amount: event.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <button
            className="btn-secondary"
            style={{ marginTop: 12, width: "100%" }}
            onClick={() => setManualRows((rows) => [...rows, { category: "", amount: "" }])}
          >
            ＋ 添加分类
          </button>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            ⚠️ 提交后将完全替换当月所有分类预算
          </p>
        </Modal>
      )}

      {modal === "total" && (
        <Modal title="设定月度总预算" onClose={closeModal} onConfirm={submitTotal}>
          <div className="form-group">
            <label>月度总预算金额</label>
            <input
              type="number"
              placeholder="如 5000"
              min={0}
              step={100}
              value={totalInput}
              onChange={(event) => setTotalInput(event.target.value)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
