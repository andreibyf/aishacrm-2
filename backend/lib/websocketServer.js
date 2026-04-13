import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { getSupabaseAdmin } from './supabaseFactory.js';
import logger from './logger.js';
import { initMemoryClient, appendEvent, disconnectMemoryClient } from './memoryClient.js';

const supabase = getSupabaseAdmin();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * WebSocket Server for Real-Time Activity Feed
 * 
 * Features:
 * - JWT authentication from cookies
 * - Tenant isolation (users only see activity from their tenant)
 * - Redis pub/sub adapter for multi-instance scaling
 * - Activity events: page views, entity mutations
 */

let io = null;
let redisClients = { pub: null, sub: null };
const supportTelemetryByUser = new Map();

const RAGE_CLICK_WINDOW_MS = 12_000;
const RAGE_CLICK_THRESHOLD = 6;
const RAGE_CLICK_COOLDOWN_MS = 60_000;
const STUCK_CLICK_THRESHOLD = 10;
const STUCK_DWELL_MS = 90_000;
const STUCK_COOLDOWN_MS = 120_000;

function parseEnvBoolean(value) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

const SUPPORT_INTELLIGENCE_ENABLED = parseEnvBoolean(process.env.SUPPORT_INTELLIGENCE_ENABLED || '');

export function resolveSocketAuthToken(handshake = {}) {
  const cookies = handshake?.headers?.cookie;
  if (cookies) {
    const parsed = cookie.parse(cookies);
    const tokenFromCookie =
      parsed.aisha_access || parsed.aisha_access_token || parsed.aisha_accessToken || null;
    if (tokenFromCookie) {
      return tokenFromCookie;
    }
  }

  return handshake?.auth?.token || null;
}

export function resolveSocketUserId(decoded = {}) {
  return decoded.sub || decoded.userId || decoded.user_id || decoded.id || null;
}

/**
 * Initialize WebSocket server
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {Server} Socket.IO server instance
 */
export function init(httpServer) {
  if (io) {
    logger.warn('WebSocket server already initialized');
    return io;
  }

  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
  });

  // Initialize Redis adapter for multi-instance support
  initializeRedisAdapter().catch(err => {
    logger.error('Failed to initialize Redis adapter for WebSocket', err);
  });

  // Initialize memory client for ephemeral support telemetry storage.
  initMemoryClient(process.env.REDIS_MEMORY_URL || process.env.REDIS_URL).catch((err) => {
    logger.warn('[WebSocket] Memory client unavailable for support telemetry', err);
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      // Extract JWT from cookies or handshake auth
      const token = resolveSocketAuthToken(socket.handshake);

      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Verify JWT
      const decoded = jwt.verify(token, JWT_SECRET);
      const socketUserId = resolveSocketUserId(decoded);

      if (!socketUserId) {
        return next(new Error('Invalid token: missing userId'));
      }

      // Fetch user from database (includes tenant_id, role, permissions)
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, role, tenant_id, first_name, last_name')
        .eq('id', socketUserId)
        .single();

      if (error || !user) {
        logger.warn(`WebSocket auth failed for userId ${socketUserId}:`, error);
        return next(new Error('User not found'));
      }

      // Store user context in socket
      socket.userId = user.id;
      socket.userEmail = user.email;
      socket.userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
      socket.tenantId = user.tenant_id;
      socket.userRole = user.role;

      logger.info(`WebSocket authenticated: ${user.email} (tenant: ${user.tenant_id})`);
      next();
    } catch (err) {
      logger.error('WebSocket authentication error:', err);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info(`WebSocket connected: user=${socket.userId}, tenant=${socket.tenantId}`);

    // Join tenant room for isolation
    socket.join(`tenant:${socket.tenantId}`);

    // Join user-specific room for targeted messages
    socket.join(`user:${socket.userId}`);

    // Send welcome event
    socket.emit('connected', {
      userId: socket.userId,
      userName: socket.userName,
      userRole: socket.userRole,
      tenantId: socket.tenantId,
      timestamp: new Date().toISOString(),
    });

    // Handle page view events
    socket.on('page_view', (data) => {
      handlePageView(socket, data);
    });

    // Handle support telemetry interaction events (navigation/click/mouse).
    socket.on('support_interaction', (data) => {
      handleSupportInteraction(socket, data);
    });

    // Handle entity mutation events
    socket.on('entity_mutation', (data) => {
      handleEntityMutation(socket, data);
    });

    // Handle user presence
    socket.on('user_online', () => {
      handleUserOnline(socket);
    });

    socket.on('user_offline', () => {
      handleUserOffline(socket);
    });

    // Handle impersonation live navigation sync lifecycle
    socket.on('impersonation_sync_start', (data) => {
      handleImpersonationSyncStart(socket, data);
    });

    socket.on('impersonation_sync_stop', (data) => {
      handleImpersonationSyncStop(socket, data);
    });

    socket.on('impersonation_nav', (data) => {
      handleImpersonationNavigation(socket, data);
    });

    // Disconnect handler
    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket disconnected: user=${socket.userId}, reason=${reason}`);
      handleUserOffline(socket);
    });

    // Error handler
    socket.on('error', (err) => {
      logger.error(`WebSocket error for user ${socket.userId}:`, err);
    });
  });

  logger.info('WebSocket server initialized successfully');
  return io;
}

/**
 * Initialize Redis pub/sub adapter for multi-instance scaling
 */
async function initializeRedisAdapter() {
  let pubClient = null;
  let subClient = null;
  try {
    const redisUrl = process.env.REDIS_MEMORY_URL || 'redis://localhost:6379';
    const redisSocketOptions = {
      // Fail fast to single-instance mode if Redis is unavailable.
      connectTimeout: 2000,
      reconnectStrategy: () => false,
    };

    // Create separate clients for pub and sub
    pubClient = createClient({ url: redisUrl, socket: redisSocketOptions });
    subClient = pubClient.duplicate();

    await Promise.all([
      pubClient.connect(),
      subClient.connect(),
    ]);

    // Create adapter
    io.adapter(createAdapter(pubClient, subClient));

    redisClients.pub = pubClient;
    redisClients.sub = subClient;

    logger.info('Redis adapter for WebSocket initialized');
  } catch (err) {
    // Ensure partially initialized Redis clients do not leak open handles.
    try {
      if (subClient) {
        await subClient.disconnect();
      }
    } catch {}
    try {
      if (pubClient) {
        await pubClient.disconnect();
      }
    } catch {}
    logger.warn('Failed to initialize Redis adapter, running in single-instance mode:', err);
  }
}

/**
 * Handle page view event
 */
function handlePageView(socket, data) {
  const activity = {
    type: 'page_view',
    userId: socket.userId,
    userName: socket.userName,
    userRole: socket.userRole,
    page: data.page,
    entityId: data.entityId || null,
    entityType: data.entityType || null,
    timestamp: new Date().toISOString(),
  };

  // Broadcast to all users in the same tenant (except sender)
  socket.to(`tenant:${socket.tenantId}`).emit('activity', activity);

  logger.debug(`Page view: ${socket.userName} → ${data.page}`);
}

/**
 * Handle entity mutation event (create, update, delete)
 */
function handleEntityMutation(socket, data) {
  const activity = {
    type: 'entity_mutation',
    userId: socket.userId,
    userName: socket.userName,
    userRole: socket.userRole,
    action: data.action, // 'create', 'update', 'delete'
    entityType: data.entityType, // 'contact', 'account', 'lead', etc.
    entityId: data.entityId,
    entityName: data.entityName || null,
    timestamp: new Date().toISOString(),
  };

  // Broadcast to all users in the same tenant (except sender)
  socket.to(`tenant:${socket.tenantId}`).emit('activity', activity);

  logger.debug(`Entity mutation: ${socket.userName} ${data.action} ${data.entityType}/${data.entityId}`);
}

/**
 * Handle user online event
 */
function handleUserOnline(socket) {
  const presence = {
    type: 'user_online',
    userId: socket.userId,
    userName: socket.userName,
    userRole: socket.userRole,
    timestamp: new Date().toISOString(),
  };

  // Broadcast to all users in the same tenant
  socket.to(`tenant:${socket.tenantId}`).emit('presence', presence);

  logger.debug(`User online: ${socket.userName}`);
}

/**
 * Handle user offline event
 */
function handleUserOffline(socket) {
  const presence = {
    type: 'user_offline',
    userId: socket.userId,
    userName: socket.userName,
    userRole: socket.userRole,
    timestamp: new Date().toISOString(),
  };

  // Broadcast to all users in the same tenant
  socket.to(`tenant:${socket.tenantId}`).emit('presence', presence);

  logger.debug(`User offline: ${socket.userName}`);
}

export function createSupportTelemetryState(nowMs = Date.now()) {
  return {
    path: null,
    lastNavigationAt: nowMs,
    clickTimes: [],
    lastAlertAt: {
      rage_click: 0,
      stuck_user: 0,
    },
  };
}

function getOrCreateSupportState(socket) {
  const key = `${socket.tenantId}:${socket.userId}`;
  if (!supportTelemetryByUser.has(key)) {
    supportTelemetryByUser.set(key, createSupportTelemetryState());
  }
  return { key, state: supportTelemetryByUser.get(key) };
}

function emitFrictionAlert(socket, alertType, details = {}) {
  const now = new Date().toISOString();
  const payload = {
    type: 'friction_alert',
    alertType,
    tenantId: socket.tenantId,
    userId: socket.userId,
    userName: socket.userName,
    userEmail: socket.userEmail,
    userRole: socket.userRole,
    timestamp: now,
    ...details,
  };

  // Broadcast to tenant room so support dashboards/agents can react.
  io.to(`tenant:${socket.tenantId}`).emit('support_friction_alert', payload);
}

function shouldTriggerAlert(state, alertType, nowMs) {
  const lastAt = state.lastAlertAt?.[alertType] || 0;
  const cooldownMs = alertType === 'rage_click' ? RAGE_CLICK_COOLDOWN_MS : STUCK_COOLDOWN_MS;
  if (nowMs - lastAt < cooldownMs) {
    return false;
  }
  state.lastAlertAt[alertType] = nowMs;
  return true;
}

export function detectSupportFriction(state, interaction, nowMs = Date.now()) {
  const alerts = [];
  if (!state || !interaction || typeof interaction !== 'object') return alerts;

  const eventType = interaction.eventType;
  if (!['navigation', 'click', 'mouse_move'].includes(eventType)) return alerts;

  if (eventType === 'navigation') {
    state.path = typeof interaction.path === 'string' ? interaction.path : state.path;
    state.lastNavigationAt = nowMs;
    state.clickTimes = [];
    return alerts;
  }

  if (eventType === 'click') {
    state.clickTimes.push(nowMs);
    state.clickTimes = state.clickTimes.filter((t) => nowMs - t <= STUCK_DWELL_MS);

    const rageClicks = state.clickTimes.filter((t) => nowMs - t <= RAGE_CLICK_WINDOW_MS).length;
    if (rageClicks >= RAGE_CLICK_THRESHOLD && shouldTriggerAlert(state, 'rage_click', nowMs)) {
      alerts.push({
        alertType: 'rage_click',
        path: interaction.path || state.path || null,
        clicksInWindow: rageClicks,
        windowMs: RAGE_CLICK_WINDOW_MS,
      });
    }

    const dwellMs = nowMs - (state.lastNavigationAt || nowMs);
    if (
      dwellMs >= STUCK_DWELL_MS &&
      state.clickTimes.length >= STUCK_CLICK_THRESHOLD &&
      shouldTriggerAlert(state, 'stuck_user', nowMs)
    ) {
      alerts.push({
        alertType: 'stuck_user',
        path: interaction.path || state.path || null,
        dwellMs,
        clickCount: state.clickTimes.length,
      });
    }
  }

  return alerts;
}

function handleSupportInteraction(socket, data) {
  if (!SUPPORT_INTELLIGENCE_ENABLED) return;
  if (!data || typeof data !== 'object') return;

  const eventType = data.eventType;
  if (!['navigation', 'click', 'mouse_move'].includes(eventType)) return;

  const nowMs = Date.now();
  const { key, state } = getOrCreateSupportState(socket);
  const alerts = detectSupportFriction(state, data, nowMs);
  alerts.forEach((alert) => {
    emitFrictionAlert(socket, alert.alertType, alert);
  });

  // Best-effort append to ephemeral event stream for support intelligence.
  appendEvent(socket.tenantId, socket.userId, 'support-intelligence', {
    system: 'support_intelligence',
    kind: eventType,
    path: data.path || state.path || null,
    x: typeof data.x === 'number' ? data.x : undefined,
    y: typeof data.y === 'number' ? data.y : undefined,
  }).catch((err) => {
    logger.debug('[WebSocket] Failed to append support telemetry event', { err: err?.message });
  });

  supportTelemetryByUser.set(key, state);
}

/**
 * Handle impersonation sync session start.
 */
function handleImpersonationSyncStart(socket, data) {
  if (!data || typeof data.syncSessionId !== 'string' || !data.syncSessionId) {
    return;
  }

  const payload = {
    syncSessionId: data.syncSessionId,
    startedAt: data.startedAt || new Date().toISOString(),
    expiresAt: data.expiresAt || null,
    sourceSocketId: socket.id,
    sourceUserId: socket.userId,
  };

  socket.to(`user:${socket.userId}`).emit('impersonation_sync_started', payload);
  logger.debug(`Impersonation sync started for user ${socket.userId}`);
}

/**
 * Handle impersonation sync session stop.
 */
function handleImpersonationSyncStop(socket, data) {
  if (!data || typeof data.syncSessionId !== 'string' || !data.syncSessionId) {
    return;
  }

  socket.to(`user:${socket.userId}`).emit('impersonation_sync_stopped', {
    syncSessionId: data.syncSessionId,
    sourceSocketId: socket.id,
    sourceUserId: socket.userId,
  });
  logger.debug(`Impersonation sync stopped for user ${socket.userId}`);
}

/**
 * Relay route navigation updates between sessions of the same user while sync is active.
 */
function handleImpersonationNavigation(socket, data) {
  if (!data || typeof data.syncSessionId !== 'string' || !data.syncSessionId) {
    return;
  }
  if (!data.path || typeof data.path !== 'string') {
    return;
  }

  socket.to(`user:${socket.userId}`).emit('impersonation_nav', {
    syncSessionId: data.syncSessionId,
    path: data.path,
    timestamp: data.timestamp || new Date().toISOString(),
    sourceSocketId: socket.id,
    sourceUserId: socket.userId,
  });
}

/**
 * Get Socket.IO server instance
 * @returns {Server|null}
 */
export function getIO() {
  if (!io) {
    logger.warn('WebSocket server not initialized yet');
  }
  return io;
}

/**
 * Cleanup and close WebSocket server
 */
export async function close() {
  if (io) {
    await new Promise((resolve) => io.close(() => resolve()));
    io = null;
    logger.info('WebSocket server closed');
  }

  if (redisClients.pub) {
    await redisClients.pub.quit();
    redisClients.pub = null;
  }

  if (redisClients.sub) {
    await redisClients.sub.quit();
    redisClients.sub = null;
  }

  await disconnectMemoryClient();
}

export default {
  init,
  getIO,
  close,
};

export const __supportIntelligenceConfig = {
  SUPPORT_INTELLIGENCE_ENABLED,
  RAGE_CLICK_WINDOW_MS,
  RAGE_CLICK_THRESHOLD,
  RAGE_CLICK_COOLDOWN_MS,
  STUCK_CLICK_THRESHOLD,
  STUCK_DWELL_MS,
  STUCK_COOLDOWN_MS,
};
