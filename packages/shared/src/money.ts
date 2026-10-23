/**
 * 金额工具（方案 6.1：数据库列统一 `numeric(12,2)`）。
 *
 * 实现选择：内部一律用 **BigInt 分**，而不是 decimal.js 或浮点数。
 * - `numeric(12,2)` 的最小单位就是「分」，整数分求和/比较天然精确；
 * - 不引入第三方库，避免 JS 浮点误差，也绕开 decimal.js 在 NodeNext 下的类型兼容问题；
 * - 只在出口格式化或转 number（旧前端契约里金额是 number）。
 */

export type MoneyInput = string | number;

/** 以「分」为单位的整数金额 */
export type Cents = bigint;

const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d*))?$/;

function toText(value: MoneyInput): string {
  if (typeof value === "string") return value.trim();
  if (!Number.isFinite(value)) throw new Error(`无效金额: ${String(value)}`);
  const text = String(value);
  if (text.includes("e") || text.includes("E")) {
    throw new Error(`金额不支持科学计数法: ${text}`);
  }
  return text;
}

/**
 * 解析成「分」。
 * 超过两位小数的部分按「四舍五入、0.5 远离零」处理，与 PostgreSQL numeric 的舍入一致。
 */
export function parseCents(value: MoneyInput): Cents {
  const text = toText(value);
  const match = DECIMAL_PATTERN.exec(text);
  if (match === null) throw new Error(`无效金额: ${text}`);

  const sign = match[1] === "-" ? -1n : 1n;
  const integerPart = match[2] ?? "0";
  const fractionPart = match[3] ?? "";
  const centsPart = (fractionPart + "00").slice(0, 2);
  const rest = fractionPart.slice(2);

  let cents = BigInt(integerPart) * 100n + BigInt(centsPart);
  // rest 是第三位小数起的数字串：只要首位 ≥ "5" 就入一位（字符串比较即可）
  if (rest.length > 0 && rest >= "5") cents += 1n;
  return sign * cents;
}

/** 整数分按「四舍六入五成双」取整，用于复刻 Python `f"{v:.0f}"` 的文案 */
function roundHalfEvenToInteger(cents: Cents): Cents {
  const sign = cents < 0n ? -1n : 1n;
  const whole = cents / 100n; // bigint 除法向零截断
  const remainder = cents % 100n;
  const absRemainder = remainder < 0n ? -remainder : remainder;

  if (absRemainder > 50n) return whole + sign;
  if (absRemainder < 50n) return whole;
  return whole % 2n === 0n ? whole : whole + sign;
}

/** 把「分」格式化回字符串；`decimalPlaces: 0` 时按银行家舍入取整 */
export function formatCents(cents: Cents, decimalPlaces: 0 | 2 = 2): string {
  if (decimalPlaces === 0) return roundHalfEvenToInteger(cents).toString();

  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function formatMoney(value: MoneyInput, decimalPlaces: 0 | 2 = 2): string {
  return formatCents(parseCents(value), decimalPlaces);
}

export function moneySum(values: readonly MoneyInput[]): Cents {
  return values.reduce<Cents>((sum, value) => sum + parseCents(value), 0n);
}

export function moneyGt(left: MoneyInput, right: MoneyInput): boolean {
  return parseCents(left) > parseCents(right);
}

export function moneyEq(left: MoneyInput, right: MoneyInput): boolean {
  return parseCents(left) === parseCents(right);
}

export function toMoneyNumber(value: MoneyInput): number {
  return Number(parseCents(value)) / 100;
}

/** 「分」转 number（出口用） */
export function centsToNumber(cents: Cents): number {
  return Number(cents) / 100;
}
