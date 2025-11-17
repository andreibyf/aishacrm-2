import jwt from 'jsonwebtoken';

export function requireAuthCookie(req, res, next) {
  try {
    const token = req.cookies?.aisha_access;
    if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'change-me-access';
    const payload = jwt.verify(token, secret);
    req.user = payload;
    return next();
  } catch (_e) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
}

export function optionalAuthCookie(req, _res, next) {
  try {
    const token = req.cookies?.aisha_access;
    if (!token) return next();
    const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'change-me-access';
    const payload = jwt.verify(token, secret);
    req.user = payload;
  } catch {
    // ignore invalid
  }
  return next();
}
