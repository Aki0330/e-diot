export function BrandMark() {
  return <span className="ledger-mark" aria-hidden="true" />;
}

export function LedgerBrand() {
  return (
    <div className="ledger-brand">
      <BrandMark />
      <span className="brand-title">e-diot</span>
      <span className="brand-description">随身账本</span>
    </div>
  );
}

export function Topbar({ onLogout }: { onLogout?: () => void }) {
  return (
    <header className="ledger-topbar">
      <LedgerBrand />
      {onLogout && (
        <button type="button" className="side-logout" onClick={onLogout}>
          退出登录
        </button>
      )}
    </header>
  );
}
