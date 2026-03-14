import dotenv from 'dotenv';
import logger from '../lib/logger.js';
import { resolveCommunicationsProviderConnection } from '../lib/communications/providerConnectionResolver.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

export async function resolveMailboxConnectionForInboundJob(
  job,
  deps = {},
) {
  const tenantId = job?.tenant_id || null;
  const mailboxId = job?.mailbox_id || null;
  const mailboxAddress = job?.mailbox_address || null;

  const resolved = await resolveCommunicationsProviderConnection(
    { tenantId, mailboxId, mailboxAddress },
    deps,
  );

  if (!resolved) {
    const error = new Error('No active communications provider connection matched the inbound mailbox');
    error.code = 'communications_provider_not_found';
    throw error;
  }

  logger.info(
    {
      tenant_id: tenantId,
      mailbox_id: mailboxId,
      mailbox_address: mailboxAddress,
      integration_id: resolved.integration?.id || null,
      provider_type: resolved.connection?.config?.provider_type || null,
      provider_name: resolved.connection?.config?.provider_name || null,
    },
    '[communications-worker] resolved mailbox connection from tenant_integrations',
  );

  return resolved;
}

let workerStarted = false;

export function startCommunicationsWorker() {
  if (workerStarted) {
    logger.warn('[communications-worker] worker already started');
    return {
      stop: () => {
        logger.debug('[communications-worker] stop called on already-running worker');
      },
    };
  }

  workerStarted = true;
  logger.info('[communications-worker] starting communications worker scaffold');

  return {
    stop: () => {
      logger.info('[communications-worker] stopping communications worker scaffold');
      workerStarted = false;
    },
  };
}

export default {
  resolveMailboxConnectionForInboundJob,
  startCommunicationsWorker,
};
