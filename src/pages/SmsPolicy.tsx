import { LegalPage } from "../components/LegalPage";

export default function SmsPolicy() {
  return (
    <LegalPage title="SMS / Text Messaging Policy" updated="June 30, 2026">
      <p>
        This SMS Policy explains how BidNeighbor uses text messages (SMS) and your consent and opt-out rights. It
        supplements our <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>Consent / opt-in</h2>
      <p>
        By providing your mobile number and opting in, you agree to receive SMS messages from BidNeighbor related to
        your account and activity — for example, sign-in codes, new matching tasks, responses to your task, and
        important account notices. Consent to receive SMS is not a condition of using the service or of any
        purchase.
      </p>

      <h2>Message frequency and cost</h2>
      <p>
        Message frequency varies based on your activity. <strong>Message and data rates may apply</strong> per your
        mobile carrier plan. BidNeighbor does not charge for the messages themselves.
      </p>

      <h2>Opting out — reply STOP</h2>
      <p>
        You can cancel SMS messages at any time by replying <strong>STOP</strong> to any message. After you send
        STOP, we will send one confirmation message and then stop sending SMS. To opt back in, reply <strong>START</strong>.
      </p>

      <h2>Help</h2>
      <p>
        Reply <strong>HELP</strong> to any message for assistance, or email{" "}
        <a href="mailto:support@bidneighbor.com">support@bidneighbor.com</a>.
      </p>

      <h2>Carriers</h2>
      <p>
        Carriers are not liable for delayed or undelivered messages. Supported carriers and delivery may vary.
      </p>

      <h2>Privacy</h2>
      <p>
        Your mobile number is handled in accordance with our <a href="/privacy">Privacy Policy</a>. We do not sell
        your number, and we do not share it with third parties for their own marketing.
      </p>
    </LegalPage>
  );
}
