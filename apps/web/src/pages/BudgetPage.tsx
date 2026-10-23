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
  const allocatedCategories = data?.categories.filter((category) => category.budget > 0) ?? [];

  return (
    <div className="budget-page">
      <div className="budget-total-card">
        {data === null ? (
          <div className="spinner" />
        ) : (
          <>
            <div className="btc-label">月度总预算</div>
            <div className="btc-value">¥{fmt(data.total_budget)}</div>
            <div className="btc-sub">
              已分配 ¥{fmt(allocated)} · 剩余 ¥{fmt(data.total_budget - allocated)}
            </div>
          </>
        )}
      </div>

      <div className="budget-actions">
        <button className="btn-secondary" onClick={() => setModal("ai")}>
          🤖 AI 智能分配
        </button>
        <button className="btn-secondary" onClick={() => setModal("manual")}>
          ✏️ 手动分配
        </button>
        <button className="btn-secondary" onClick={() => setModal("total")}>
          ⚙️ 设定总预算
        </button>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">分类预算</span>
        </div>
      </div>

      <div className="budget-cards">
        {data === null ? (
          <div className="spinner" />
        ) : allocatedCategories.length > 0 ? (
          allocatedCategories.map((category) => (
            <div key={category.category} className="budget-cat-card">
              <div className="bcc-emoji">{catEmoji(category.category)}</div>
              <div className="bcc-name">{category.category}</div>
              <div className="bcc-limit">预算 ¥{fmt(category.budget)}</div>
              <div className="bcc-spent">
                已花 ¥{fmt(category.spent)} ({category.percentage}%)
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state full-width">
            <div className="empty-emoji">📋</div>
            <div className="empty-text">
              还没有分配分类预算
              <br />
              点击上方按钮开始分配
            </div>
          </div>
        )}
      </div>

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
