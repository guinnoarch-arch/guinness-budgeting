export default function WelcomeScreen({ onSetup, onExplore }) {
  return (
    <main className="welcome-screen">
      <div className="welcome-card">
        <div className="brand-icon large"><img src="/icons/gb-icon-192.png" alt="" /></div>
        <h1>Guinness Budgeting</h1>
        <p>
          Track income, spending, savings, bills and budgets locally on your computer.
        </p>
        <div className="welcome-actions">
          <button className="primary-button" onClick={onSetup}>Setup</button>
          <button className="secondary-button" onClick={onExplore}>Explore example app</button>
        </div>
      </div>
    </main>
  );
}
