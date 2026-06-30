import { LegalPage } from "../components/LegalPage";

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="June 30, 2026">
      <p>
        BidNeighbor ("BidNeighbor", "we", "us") operates a local service-request marketplace that connects
        people who post local tasks with nearby providers. This Privacy Policy explains what we collect, how we
        use it, and the choices you have.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account information</strong> — your name, email address, and phone number when you sign up or sign in.</li>
        <li><strong>Profile information</strong> — for providers, the categories you serve, a short bio, and your service location (town/county/city/state/ZIP).</li>
        <li><strong>Task content</strong> — the details, location notes, budget, and any photos or files you attach when posting or responding to a task.</li>
        <li><strong>Approximate location</strong> — if you grant consent, we use your device's network-derived location (from Cloudflare's edge) to pre-fill your town and ZIP. You can decline or edit this at any time.</li>
        <li><strong>Usage and device data</strong> — IP address, browser type, and basic log data used for security, rate-limiting, and abuse prevention.</li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To operate the marketplace — show tasks to relevant nearby providers and let customers and providers communicate.</li>
        <li>To send you transactional and notification emails (for example, a new matching task or a response to your task). You can manage email notifications in your account settings.</li>
        <li>To send SMS messages where you have opted in — see our <a href="/sms-policy">SMS Policy</a>.</li>
        <li>To prevent fraud and abuse, enforce our <a href="/terms">Terms of Service</a>, and comply with law.</li>
      </ul>

      <h2>What we share</h2>
      <p>
        We do not sell your personal information. Limited information is shown to other users by design: a task's
        public page shows the task details and any attached photos (but not your email or phone), and a provider's
        directory listing shows only their name, city, state, and ZIP. We use service providers (such as our email
        and infrastructure vendors) who process data on our behalf under contract.
      </p>

      <h2>Photos and file retention</h2>
      <p>
        Photos attached to a task are stored in object storage. To control cost while keeping shared links usable,
        files follow a lifecycle: kept in standard ("hot") storage for the first 30 days, moved to lower-cost
        ("cold") storage for the next 60 days, and permanently deleted at 90 days. After deletion a shared task
        link will no longer display the original images. Task text and summary data may be retained longer for
        recordkeeping. See our <a href="/terms">Terms</a> for more on content.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li><strong>Email notifications</strong> — turn categories of email on or off in account settings.</li>
        <li><strong>SMS</strong> — reply STOP to opt out at any time (see the <a href="/sms-policy">SMS Policy</a>).</li>
        <li><strong>Location</strong> — decline the location prompt, or edit any pre-filled location.</li>
        <li><strong>Access and deletion</strong> — contact us to access or delete your account data.</li>
      </ul>

      <h2>Children</h2>
      <p>BidNeighbor is not directed to children under 13, and we do not knowingly collect their information.</p>

      <h2>Contact</h2>
      <p>Questions about this policy? Email <a href="mailto:support@bidneighbor.com">support@bidneighbor.com</a>.</p>
    </LegalPage>
  );
}
