import jwt from 'jsonwebtoken';
import { getAccessSecret } from '../lib/jwtSecret.js';

export function requireAuthCookie(req, res, next) {
  try {
    const token = req.cookies?.aisha_access;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    const secret = getAccessSecret();
    const payload = jwt.verify(token, secret);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
}

export function optionalAuthCookie(req, _res, next) {
  try {
    const token = req.cookies?.aisha_access;
    if (!token) return next();
    const secret = getAccessSecret();
    const payload = jwt.verify(token, secret);
    req.user = payload;
  } catch {
    // ignore invalid
  }
  return next();
}
