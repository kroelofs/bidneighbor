import { LegalPage } from "../components/LegalPage";

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="June 30, 2026">
      <p>
        Welcome to BidNeighbor. By creating an account or using the service, you agree to these Terms of Service
        ("Terms"). If you do not agree, do not use the service.
      </p>

      <h2>The service</h2>
      <p>
        BidNeighbor is a marketplace that lets people post local tasks and lets nearby providers respond with
        questions and quotes. BidNeighbor is a venue only — we are not a party to any agreement between a customer
        and a provider, we do not perform the services, and we do not guarantee any task will be completed or any
        quote honored.
      </p>

      <h2>Eligibility and accounts</h2>
      <ul>
        <li>You must be at least 18 years old and able to form a binding contract.</li>
        <li>You are responsible for the accuracy of your account information and for activity under your account.</li>
        <li>Keep your sign-in credentials secure; notify us of any unauthorized use.</li>
      </ul>

      <h2>Your content and conduct</h2>
      <ul>
        <li>You retain ownership of the content you post (task details, photos, messages). You grant BidNeighbor a license to host, display, and distribute that content as needed to operate the service.</li>
        <li>You are responsible for ensuring you have the rights to any photos or files you upload.</li>
        <li>Do not post unlawful, fraudulent, infringing, harassing, or misleading content, and do not use the service to spam or scrape other users.</li>
        <li>Photos and files are retained on the schedule described in our <a href="/privacy">Privacy Policy</a> (30 days hot, 60 days cold, deleted at 90 days).</li>
      </ul>

      <h2>Providers and customers</h2>
      <p>
        Quotes, scheduling, payment, and the actual work are arranged directly between customers and providers.
        Each party is solely responsible for verifying the other, for any licensing or insurance required for the
        work, and for complying with applicable law. BidNeighbor does not screen users and makes no warranty about
        any user.
      </p>

      <h2>Fees</h2>
      <p>
        Posting and browsing are currently free. If we introduce fees, we will disclose them before they apply.
      </p>

      <h2>Disclaimers and limitation of liability</h2>
      <p>
        The service is provided "as is" without warranties of any kind. To the maximum extent permitted by law,
        BidNeighbor is not liable for any indirect, incidental, or consequential damages, or for the acts,
        omissions, or content of any user. Our total liability for any claim relating to the service is limited to
        the greater of the amounts you paid us in the past 12 months or US $100.
      </p>

      <h2>Termination</h2>
      <p>We may suspend or terminate accounts that violate these Terms or that we reasonably believe create risk.</p>

      <h2>Changes</h2>
      <p>We may update these Terms; material changes will be posted here with a new "last updated" date.</p>

      <h2>Contact</h2>
      <p>Questions? Email <a href="mailto:support@bidneighbor.com">support@bidneighbor.com</a>.</p>
    </LegalPage>
  );
}
