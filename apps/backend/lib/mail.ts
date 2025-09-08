import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
export const resend = new Resend(RESEND_API_KEY);

export async function sendMagicLink(email: string, url: string) {
  await resend.emails.send({
    from: "v4run.me",
    to: email,
    subject: "Your sign-in link",
    html: `
      <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto">
        <p>Click to sign in:</p>
        <p><a href="${url}">${url}</a></p>
        <p>link expires in 5 mins Bro , jaldi Karo .</p>
      </div>
    `,
  });
}
