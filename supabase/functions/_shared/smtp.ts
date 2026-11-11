export const OUTREACH_EMAIL = "marketing@officeandco.co.za";
export const OUTREACH_FROM = `Office & Co <${OUTREACH_EMAIL}>`;

type SmtpMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function wrapBase64(value: string) {
  return encodeBase64(value).match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function createMimeMessage({ to, subject, text, html }: SmtpMessage) {
  const boundary = `oandco_${crypto.randomUUID().replace(/-/g, "")}`;
  return [
    `From: ${OUTREACH_FROM}`,
    `To: <${to}>`,
    `Reply-To: ${OUTREACH_EMAIL}`,
    `Subject: =?UTF-8?B?${encodeBase64(subject)}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(html),
    `--${boundary}--`,
  ].join("\r\n");
}

export async function sendSmtpEmail(message: SmtpMessage) {
  const hostname = Deno.env.get("SMTP_HOST")?.trim();
  const username = Deno.env.get("SMTP_USER")?.trim();
  const password = Deno.env.get("SMTP_PASS");
  const port = Number(Deno.env.get("SMTP_PORT") ?? "465");

  if (!hostname || !username || !password) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_PORT secrets.");
  }
  if (port !== 465) {
    throw new Error("Supabase SMTP delivery requires implicit TLS on port 465; ports 25 and 587 are blocked.");
  }
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(message.to)) {
    throw new Error("A valid recipient email address is required.");
  }
  if (/[\r\n]/.test(message.subject)) {
    throw new Error("Email subject must not contain line breaks.");
  }

  const connection = await Deno.connectTls({ hostname, port });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const readBuffer = new Uint8Array(4096);
  let pending = "";

  const readResponse = async () => {
    const lines: string[] = [];
    while (true) {
      let end = pending.indexOf("\r\n");
      while (end < 0) {
        const bytesRead = await connection.read(readBuffer);
        if (bytesRead === null) throw new Error("SMTP server closed the connection unexpectedly.");
        pending += decoder.decode(readBuffer.subarray(0, bytesRead), { stream: true });
        end = pending.indexOf("\r\n");
      }
      const line = pending.slice(0, end);
      pending = pending.slice(end + 2);
      lines.push(line);
      if (/^\d{3} /.test(line)) return { code: Number(line.slice(0, 3)), text: lines.join("\n") };
      if (!/^\d{3}-/.test(line)) throw new Error(`Unexpected SMTP response: ${line}`);
    }
  };

  const write = async (value: string) => {
    const bytes = encoder.encode(value);
    let offset = 0;
    while (offset < bytes.length) offset += await connection.write(bytes.subarray(offset));
  };

  const expect = async (command: string | null, expectedCodes: number[]) => {
    if (command !== null) await write(`${command}\r\n`);
    const response = await readResponse();
    if (!expectedCodes.includes(response.code)) {
      throw new Error(`SMTP ${command?.split(" ", 1)[0] ?? "greeting"} failed: ${response.text}`);
    }
    return response;
  };

  try {
    await expect(null, [220]);
    await expect("EHLO officeandco.co.za", [250]);
    await expect("AUTH LOGIN", [334]);
    await expect(encodeBase64(username), [334]);
    await expect(encodeBase64(password), [235]);
    await expect(`MAIL FROM:<${OUTREACH_EMAIL}>`, [250]);
    await expect(`RCPT TO:<${message.to}>`, [250, 251]);
    await expect("DATA", [354]);
    const mimeMessage = createMimeMessage(message)
      .replace(/\r?\n/g, "\r\n")
      .replace(/^\./gm, "..");
    await write(`${mimeMessage}\r\n.\r\n`);
    const sentResponse = await expect(null, [250]);
    await expect("QUIT", [221]);
    return sentResponse.text;
  } finally {
    connection.close();
  }
}