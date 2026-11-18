import { AVATARS } from "../utils/avatar.js";

export interface AvatarPickerProps {
  readonly value: string;
  readonly onChange: (emoji: string) => void;
  readonly label?: string;
  readonly hint?: string;
}

/** 形象选择器：一排可点的表情，纯本地状态，不触发接口 */
export function AvatarPicker({ value, onChange, label, hint }: AvatarPickerProps) {
  return (
    <div className="avatar-picker">
      {label !== undefined && (
        <div className="avatar-picker-label">
          {label}
          {hint !== undefined && <span>{hint}</span>}
        </div>
      )}
      <div className="avatar-picker-row" role="radiogroup" aria-label={label ?? "选择形象"}>
        {AVATARS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={value === item.emoji}
            aria-label={item.name}
            title={item.name}
            className={`avatar-opt${value === item.emoji ? " on" : ""}`}
            onClick={() => onChange(item.emoji)}
          >
            <span className="avatar-opt-emoji">{item.emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
