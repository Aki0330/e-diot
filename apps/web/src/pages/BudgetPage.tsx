import { useCallback, useEffect, useState } from "react";
import { parseCents } from "@cyberbudget/shared/money";

import { api } from "../api/client.js";
import type { DashboardData } from "../api/types.js";
import { Modal } from "../components/Modal.js";
import { useToast } from "../components/Toast.js";
import { catEmoji } from "../utils/format.js";
import {
  allocationSummary,
  budgetProgress,
  ledgerAmount as fmt,
  ledgerCents,
} from "../utils/ledger.js";

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
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  const [aiInput, setAiInput] = useState("");
  const [totalInput, setTotalInput] = useState("");
  const [manualRows, setManualRows] = useState<readonly ManualRow[]>([
    { category: "", amount: "" },
  ]);

  const load = useCallback(async (): Promise<void> => {
    try {
      setData(await api.dashboard());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
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

  if (data === null) {
    return (
      <div className="page">
        <div className="empty">
          {error === null ? (
            <div className="spinner" aria-label="正在加载预算" />
          ) : (
            <>
              <p role="alert">{error}</p>
              <button className="btn-secondary" onClick={() => void load()}>
                重新加载
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const usage = budgetProgress(data.total_spent, data.total_budget);
  const { allocated, label: allocationLabel } = allocationSummary(
    data.total_budget,
    data.categories.map((category) => category.budget),
  );
  const rows = data.categories
    .map((row) => ({ ...row, progress: budgetProgress(row.spent, row.budget) }))
    .sort((a, b) => b.percentage - a.percentage);
  const allocatedRows = rows.filter((row) => row.budget > 0);
  const overCount = rows.filter((row) => row.progress.state === "over").length;
  const nearCount = rows.filter((row) => row.progress.state === "near").length;

  return (
    <div className="page ledger-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">预算</h2>
          <p className="ledger-period">
            {data.year_month.slice(0, 4)} 年 {Number(data.year_month.slice(5))} 月
          </p>
        </div>
        <div className="head-side">
          <button
            className="btn-secondary"
            onClick={() => {
              setTotalInput(String(data.total_budget));
              setModal("total");
            }}
          >
            设置总预算
          </button>
          <button className="btn-primary" onClick={() => setModal("ai")}>
            AI 分配
          </button>
        </div>
      </div>

      <div className="budget-top">
        <div className="bt-cell">
          <div className="bt-k">月总预算</div>
          <div className="bt-v num">¥{fmt(data.total_budget)}</div>
          <div className="bt-note">
            已分配 ¥{ledgerCents(allocated)} · {allocationLabel}
          </div>
        </div>
        <div className="bt-cell">
          <div className="bt-k">本月支出</div>
          <div className="bt-v num">¥{fmt(data.total_spent)}</div>
          <div className="bt-note">
            {usage.state === "unset"
              ? "未设月总预算"
              : `${data.remaining < 0 ? "超支" : "剩余"} ¥${fmt(Math.abs(data.remaining))} · 已用 ${usage.label}`}
          </div>
        </div>
        <div className="bt-cell">
          <div className="bt-k">已分配分类</div>
          <div className="bt-v num">{allocatedRows.length}</div>
          <div className="bt-note">
            {overCount} 项超支 · {nearCount} 项接近上限
          </div>
        </div>
        <div className="bt-bar-wrap">
          <div className="bt-bar" aria-hidden="true">
            {allocatedRows.map((row) => (
              <div
                key={row.category}
                className="bt-seg"
                style={{
                  width: `${allocated > 0n ? (Number(parseCents(row.budget)) / Number(allocated)) * 100 : 0}%`,
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
          <button
            className="btn-text"
            onClick={() => {
              if (allocatedRows.length)
                setManualRows(
                  allocatedRows.map((row) => ({
                    category: row.category,
                    amount: String(row.budget),
                  })),
                );
              setModal("manual");
            }}
          >
            编辑分类
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="empty" style={{ border: 0, boxShadow: "none" }}>
            <div className="empty-title">还没有分配分类预算</div>
            <p className="empty-desc">可以用 AI 自然语言分配，或手动编辑分类额度。</p>
          </div>
        ) : (
          rows.map((row) => (
            <div className="brow" key={row.category}>
              <div className="icon-tile">{catEmoji(row.category)}</div>
              <div className="brow-main">
                <div className="brow-name">{row.category}</div>
              </div>
              <div className="brow-mid">
                <div className="brow-amounts">
                  <span className="brow-spent">
                    ¥{fmt(row.spent)}
                    {row.budget > 0 && <span> / ¥{fmt(row.budget)}</span>}
                  </span>
                  {row.budget > 0 && (
                    <span>
                      {row.spent > row.budget ? "超出" : "剩余"} ¥
                      {ledgerCents(
                        row.spent > row.budget
                          ? parseCents(row.spent) - parseCents(row.budget)
                          : parseCents(row.budget) - parseCents(row.spent),
                      )}
                    </span>
                  )}
                </div>
                <div className={`bar ${row.progress.state}`}>
                  <span style={{ width: `${row.progress.width}%` }} />
                </div>
              </div>
              <div className="brow-right">
                <span className="brow-pct">{row.progress.label}</span>
                <span className="brow-state">
                  {
                    { over: "超支", full: "已用完", near: "接近上限", normal: "额度内", unset: "" }[
                      row.progress.state
                    ]
                  }
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {modal === "ai" && (
        <Modal title="AI 智能分配预算" onClose={closeModal} onConfirm={submitAi}>
          <div className="form-group">
            <label htmlFor="budget-ai-input">预算分配描述</label>
            <textarea
              id="budget-ai-input"
              rows={3}
              placeholder="例如：餐饮2000，交通500，购物1000，娱乐500"
              value={aiInput}
              onChange={(event) => setAiInput(event.target.value)}
            />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
            只调整描述中提到的分类。
          </p>
        </Modal>
      )}

      {modal === "manual" && (
        <Modal title="手动分配预算" onClose={closeModal} onConfirm={submitManual}>
          <div>
            {manualRows.map((row, index) => (
              <div key={index} className="form-group">
                <label htmlFor={`budget-category-${index}`}>分类</label>
                <input
                  id={`budget-category-${index}`}
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
                <label style={{ marginTop: 8 }} htmlFor={`budget-limit-${index}`}>
                  金额（元）
                </label>
                <input
                  id={`budget-limit-${index}`}
                  type="number"
                  placeholder="如 2000"
                  min={0}
                  step="0.01"
                  value={row.amount}
                  onChange={(event) =>
                    setManualRows((rows) =>
                      rows.map((item, i) =>
                        i === index ? { ...item, amount: event.target.value } : item,
                      ),
                    )
                  }
                />
                {manualRows.length > 1 && (
                  <button
                    className="btn-text"
                    type="button"
                    aria-label={`移除分类 ${index + 1}`}
                    onClick={() => setManualRows((rows) => rows.filter((_, i) => i !== index))}
                  >
                    移除分类
                  </button>
                )}
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
            保存后，这份列表将替换当月的分类预算。
          </p>
        </Modal>
      )}

      {modal === "total" && (
        <Modal title="设定月度总预算" onClose={closeModal} onConfirm={submitTotal}>
          <div className="form-group">
            <label htmlFor="budget-total-input">月度总预算（元）</label>
            <input
              id="budget-total-input"
              type="number"
              placeholder="如 5000"
              min={0}
              step="0.01"
              value={totalInput}
              onChange={(event) => setTotalInput(event.target.value)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
