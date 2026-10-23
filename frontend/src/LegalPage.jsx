import { ArrowLeft, Wind } from 'lucide-react';
import './styles.css';

const UPDATED = '23 October 2026';

function LegalLayout({ title, children }) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <a className="legal-brand" href="/" aria-label="Wind Forecast Intelligence home">
          <span className="legal-brand-mark"><Wind size={22} /></span>
          <span>Wind Forecast Intelligence</span>
        </a>
        <a className="legal-back" href="/"><ArrowLeft size={15} /> Back to analysis</a>
      </header>
      <article className="legal-content">
        <div className="eyebrow">SITE INFORMATION</div>
        <h1>{title}</h1>
        <p className="legal-updated">Draft version dated {UPDATED}. Requires owner and legal review before public launch.</p>
        {children}
        <div className="legal-review-warning" role="note">
          This page is an implementation draft, not legal advice or a representation that the service complies with every applicable legal requirement. The operator must review and approve it before public launch and supply any required owner, contact, jurisdiction, and retention details.
        </div>
      </article>
      <footer className="legal-footer"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms and Conditions</a><span>Wind Forecast Intelligence</span></footer>
    </main>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <h2>1. Scope and operator details</h2>
      <p>This draft describes the data flows visible in the current Wind Forecast Intelligence implementation. The service operator's legal name, jurisdiction, and contact details have not been supplied and are intentionally not invented. The operator must complete any disclosures required for the intended launch location and audience.</p>
      <h2>2. Information processed by the application</h2>
      <p>The browser sends analysis parameters to the application API: a delivery date within January 2026, one or more cutoff times, and an optional refresh flag. The backend uses those values to request public data from Elexon and calculate historical forecast evaluation results. The current application has no user accounts, authentication, application database, or user-submitted free-text form.</p>
      <p>As with most web services, the hosting platform or network infrastructure may process ordinary request metadata such as IP address, user agent, request path, timestamps, and server errors in operational logs. The hosting operator's precise log fields, access rules, and retention periods must be checked and documented before launch. This application does not define or guarantee those external hosting practices.</p>
      <h2>3. Data sources</h2>
      <p>Generation observations and wind forecast publications are retrieved from the public Elexon Insights API using only the FUELHH and WINDFOR datasets. Please review <a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream" target="_blank" rel="noreferrer">Elexon FUELHH documentation</a> and <a href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream" target="_blank" rel="noreferrer">Elexon WINDFOR documentation</a>. Elexon and the hosting provider are independent third parties with their own availability and privacy terms.</p>
      <h2>4. Cookies, local storage, and analytics</h2>
      <p>The current frontend code does not intentionally set application cookies, write browser local storage, or include a third-party analytics tracker. This statement is limited to the inspected application code and does not establish whether the hosting platform or third-party infrastructure uses its own technical cookies or logs.</p>
      <h2>5. Retention and security</h2>
      <p>The backend keeps successful source responses and derived analyses in process memory for five minutes to reduce repeated requests. This is a temporary application cache and is not a durable database. Hosting logs may have separate retention settings that must be confirmed with the hosting operator. The service makes no claim of certification or guaranteed error-free availability.</p>
      <h2>6. Contact and policy changes</h2>
      <p>No privacy contact address has been supplied, so none is shown here. Before launch, the operator should add a monitored contact route and explain the process for privacy requests, applicable legal rights, and policy changes as required.</p>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms and Conditions">
      <h2>1. Purpose of the service</h2>
      <p>Wind Forecast Intelligence is a historical analytics tool for evaluating UK national-level wind generation forecast publications against actual wind generation observations for delivery dates in January 2026. It selects eligible forecasts according to a configurable previous-day publication cutoff and calculates descriptive error metrics.</p>
      <h2>2. Not advice or automated action</h2>
      <p>The service does not provide financial, trading, investment, procurement, legal, or other professional advice. It does not make or execute purchasing decisions, market bids, or operational control actions. Cutoff times are user-selected analysis scenarios. The default 16:00 cutoff is a demonstration assumption, not an official decision deadline.</p>
      <h2>3. Data availability and analytical limitations</h2>
      <p>Results depend on the availability, quality, timestamps, and historical revisions of the Elexon FUELHH and WINDFOR datasets and on the application's documented retrieval windows. Missing observations remain missing, and metrics are based only on valid matched numeric pairs. Coverage may differ by date and cutoff, and partial data can affect interpretation.</p>
      <p>The operator does not warrant uninterrupted availability, completeness, accuracy, suitability for a particular purpose, or error-free calculations. Users should independently verify results before relying on them for consequential decisions.</p>
      <h2>4. Acceptable use</h2>
      <p>Users are responsible for determining whether their use of the service and any output is appropriate and lawful. Users must not interfere with the service, attempt unauthorized access, or misuse upstream services. Upstream data may be subject to Elexon's own terms and conditions.</p>
      <h2>5. Operator details, governing law, and changes</h2>
      <p>The operator identity, governing law, dispute venue, and formal contact route have not been supplied. These terms cannot be considered final until the owner has completed those details and obtained suitable legal review. The operator must publish an effective process for changing these terms before launch.</p>
    </LegalLayout>
  );
}
