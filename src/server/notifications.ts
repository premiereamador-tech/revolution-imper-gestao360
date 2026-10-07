import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { env } from "@/server/env";

/**
 * Notificações (§54) por adaptadores. Cada canal é independente e configurado por
 * variável de ambiente; "mock" registra no log do servidor sem enviar nada.
 */
export interface NotificationMessage {
  companyId: string;
  userId?: string | null;
  title: string;
  body?: string;
  link?: string;
  severity?: "info" | "atencao" | "critico";
  email?: string | null;
  whatsapp?: string | null;
}

export interface ChannelAdapter {
  name: string;
  send(msg: NotificationMessage): Promise<void>;
}

const inApp: ChannelAdapter = {
  name: "in_app",
  async send(m) {
    await db.insert(notifications).values({ companyId: m.companyId, userId: m.userId ?? null, channel: "in_app", title: m.title, body: m.body, link: m.link, severity: m.severity ?? "info", sentAt: new Date() });
  },
};

let transporter: Transporter | null = null;
const email: ChannelAdapter = {
  name: "email",
  async send(m) {
    if (!m.email) return;
    if (env.NOTIFY_EMAIL_DRIVER === "mock" || !env.SMTP_URL) {
      console.info(`[notificação:email:mock] para=${m.email} | ${m.title}`);
      return;
    }
    transporter ??= nodemailer.createTransport(env.SMTP_URL);
    const url = m.link ? `${env.APP_URL}${m.link}` : env.APP_URL;
    await transporter.sendMail({
      from: `Revolution Imper Gestão 360 <${new URL(env.SMTP_URL).username || "no-reply@localhost"}>`,
      to: m.email,
      subject: m.title,
      text: `${m.body ?? m.title}\n\nAbrir: ${url}`,
    });
  },
};

const whatsapp: ChannelAdapter = {
  name: "whatsapp",
  async send(m) {
    if (!m.whatsapp) return;
    if (env.NOTIFY_WHATSAPP_DRIVER === "mock" || !env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) {
      console.info(`[notificação:whatsapp:mock] para=${m.whatsapp} | ${m.title}`);
      return;
    }
    // API oficial WhatsApp Cloud (Meta). Mensagens proativas exigem template aprovado.
    const res = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: `55${m.whatsapp.replace(/\D/g, "")}`, type: "text", text: { body: `${m.title}\n${m.body ?? ""}`.slice(0, 1000) } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}`);
  },
};

export const CHANNELS: Record<string, ChannelAdapter> = { in_app: inApp, email, whatsapp };

/** Envia pelos canais pedidos. Falha em um canal não impede os demais. */
export async function notify(msg: NotificationMessage, channels: Array<keyof typeof CHANNELS> = ["in_app"]) {
  const results = await Promise.allSettled(channels.map((c) => CHANNELS[c].send(msg)));
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`[notificação:${channels[i]}] falhou`, r.reason);
  });
}
