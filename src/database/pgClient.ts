/** node-postgres connection opening, shared by the extension and the tests. Pure: no `vscode` import. */
import { Client } from 'pg';
import { DataSource, sslOption } from './dataSourceLogic';

/** Opens a node-postgres client; "prefer" tries SSL first, then a plain connection (libpq behavior). */
export async function openClient(source: DataSource, password: string | undefined, timeoutMs = 10000): Promise<Client> {
  const attempt = async (ssl: ReturnType<typeof sslOption>): Promise<Client> => {
    const client = new Client({
      host: source.host,
      port: source.port,
      database: source.database,
      user: source.user,
      password: password ?? undefined,
      ssl,
      connectionTimeoutMillis: timeoutMs,
      application_name: 'UnIntelliJ',
    });
    await client.connect();
    return client;
  };
  if (source.ssl !== 'prefer') {
    return attempt(sslOption(source.ssl));
  }
  try {
    return await attempt(sslOption('prefer'));
  } catch (error) {
    if (/does not support SSL|SSL off|no pg_hba\.conf entry.*SSL/i.test(String(error))) {
      return attempt(false);
    }
    throw error;
  }
}

