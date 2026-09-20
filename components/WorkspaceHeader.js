"use client";

import ActionMenu from "./ActionMenu";
import ThemeToggle from "./ThemeToggle";

export default function WorkspaceHeader({
  activeView,
  onAgencies,
  onTickets,
  openTicketsCount,
  viewItems = [],
  settingsItems,
}) {
  return (
    <header className="workspace-header shrink-0 z-40">
      <div className="workspace-header__inner">
        <nav className="view-switcher workspace-header__views" aria-label="Workspace view">
          <button onClick={onAgencies} className={activeView === "agencies" ? "is-active" : ""}>
            Agencies
          </button>
          <button onClick={onTickets} className={activeView === "tickets" ? "is-active" : ""}>
            Tickets
            {openTicketsCount > 0 && (
              <span className="view-switcher__count">{openTicketsCount}</span>
            )}
          </button>
        </nav>

        <div className="workspace-brand" aria-label="Zaviri Agency Outreach">
          <img src="/logo.webp" alt="Zaviri" className="brand-mark" />
          <h1 className="workspace-title">Agency Outreach</h1>
        </div>

        <div className="workspace-header__settings">
          <ActionMenu
            label="Settings"
            iconOnly
            triggerIcon="settings"
            items={[
              ...(viewItems.length > 0
                ? [
                    {
                      label: "View",
                      submenu: viewItems,
                    },
                    { separator: true },
                  ]
                : []),
              ...settingsItems,
              { separator: true },
              {
                key: "theme",
                content: (
                  <div className="settings-theme-row">
                    <span>Appearance</span>
                    <ThemeToggle compact />
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
    </header>
  );
}
