export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}
export interface EmailProvider {
  send(msg: EmailMessage): Promise<void>;
}

/** Dev provider: prints metadata only. Add a Resend/Postmark provider here when needed. */
const consoleProvider: EmailProvider = {
  async send(msg) {
    console.log("[email:console]", { to: msg.to, subject: msg.subject });
  },
};

export function getEmail(): EmailProvider {
  return consoleProvider;
}
