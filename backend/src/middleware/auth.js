import jwt from 'jsonwebtoken';

export const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Access denied. No token provided.',
        authRequired: true 
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Add user info to request
    req.user = decoded;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Invalid token',
        authRequired: true 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        authRequired: true,
        expired: true
      });
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      details: error.message 
    });
  }
};

// Role-based authorization middleware
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required',
        authRequired: true 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access forbidden. Insufficient permissions.',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }

    next();
  };
};

export default { auth, authorize };
