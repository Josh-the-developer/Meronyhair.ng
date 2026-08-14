import { config } from "../config/index.js";

/**
 * Transactional email service.
 * Provider: "console" (dev) | "resend" | "sendgrid" (wire when keys present)
 */
export async function sendEmail({ to, subject, text, html, template }) {
  const payload = {
    to,
    subject,
    text,
    html,
    template,
    from: config.email.from,
  };

  if (config.email.provider === "console" || !config.email.apiKey) {
    console.log("[email:console]", JSON.stringify(payload, null, 2));
    return { id: `console-${Date.now()}`, status: "logged" };
  }

  // Placeholder for real providers – implement when credentials supplied
  if (config.email.provider === "resend") {
    // await fetch("https://api.resend.com/emails", { ... })
    console.warn("[email] Resend provider selected but integration not fully wired yet");
    return { id: null, status: "not_implemented" };
  }

  return { id: null, status: "skipped" };
}

export async function sendOrderConfirmation(order) {
  return sendEmail({
    to: order.email,
    subject: `Order ${order.order_number} confirmed – Merony Hair.NG`,
    text: `Thank you for your order ${order.order_number}. Total: ₦${Number(order.total).toLocaleString()}. We will notify you when it ships.`,
    template: "order_confirmation",
  });
}

export async function sendContactAcknowledgement({ name, email }) {
  return sendEmail({
    to: email,
    subject: "We received your message – Merony Hair.NG",
    text: `Hello ${name}, thanks for contacting Merony Hair.NG. Our team will reply shortly.`,
    template: "contact_acknowledgement",
  });
}
