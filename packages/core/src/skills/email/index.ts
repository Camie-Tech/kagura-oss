import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface EmailSkillConfig {
  imap: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
}

export interface ReadLatestEmailOptions {
  matchingSubject?: RegExp;
  since?: Date;
  timeoutMs?: number;
}

export interface Email {
  subject?: string;
  from?: { value: { address?: string; name?: string }[] };
  text?: string | false;
  html?: string | false;
}

/**
 * Connects to an IMAP server and reads the latest email matching the criteria.
 */
export async function readLatestEmail(
  config: EmailSkillConfig,
  options: ReadLatestEmailOptions = {}
): Promise<Email | null> {
  const { timeoutMs = 30000, since = new Date(Date.now() - 5 * 60 * 1000) } = options;

  const client = new ImapFlow(config.imap);
  let email: Email | null = null;

  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      await client.connect();
      
      const lock = await client.getMailboxLock('INBOX');
      try {
        const messages = client.fetch(
          { seen: false, since },
          { envelope: true, source: true }
        );

        for await (const msg of messages) {
          const parsed = await simpleParser(msg.source);
          const subject = parsed.subject || '';
          
          if (!options.matchingSubject || options.matchingSubject.test(subject)) {
            email = parsed;
            // Optional: Mark as read
            // await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen']);
            break; // Found the newest matching email
          }
        }
      } finally {
        lock.release();
      }

      if (email) break; // Exit loop if email found

    } catch (err) {
      console.error('IMAP connection error:', err);
      // Don't break, allow retry
    } finally {
      if (client.usable) {
        await client.logout();
      }
    }

    if (!email) {
      // Wait a bit before polling again
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  return email;
}
