import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
export const resend = new Resend(RESEND_API_KEY);
export async function sendMagicLink(email: string, url: string) {
  try {
    const result = await resend.emails.send({
      from: "Login <messages@message.v4run.me>",
      to: `${email}`,
      subject: "Your sign-in link",
      html: `<p>Click to sign in: <a href="${url}">${url}</a></p>`,
    });
    console.log("[mail] sent:", result);
    return result;
  } catch (err: any) {
    console.error("[mail] error:", err?.message ?? err);
    throw err;
  }
}
