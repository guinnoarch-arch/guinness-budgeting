// Header search across transactions, accounts, bills and houses.
export function SearchPanel({ searchQuery, searchResults, setActivePage, setSearchQuery, setShowSearch }) {
  return (
    <div className="command-panel" role="dialog" aria-label="Global search">
      <div className="notification-panel-header">
        <strong>Search</strong>
        <button type="button" className="text-button" onClick={() => setShowSearch(false)}>Close</button>
      </div>
      <input
        value={searchQuery}
        onChange={event => setSearchQuery(event.target.value)}
        placeholder="Search transactions, accounts, bills, houses..."
        aria-label="Search query"
        autoFocus
      />
      <div className="notification-list">
        {searchResults.length === 0 ? (
          <p className="muted">No results yet.</p>
        ) : searchResults.map((item, index) => (
          <button
            type="button"
            key={`${item.type}-${item.label}-${index}`}
            className="notification-row notice"
            onClick={() => {
              setShowSearch(false);
              setActivePage(item.page);
            }}
          >
            <span>
              <strong>{item.type}: {item.label}</strong>
              <small>{item.detail || item.page}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
