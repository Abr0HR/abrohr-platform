const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// POST /api/auth/register - Company registration
router.post('/register',
  [
    body('name').trim().notEmpty().withMessage('Company name is required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('industry').optional().trim(),
    body('size').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, password, industry, size } = req.body;

      // Check if company already exists
      const existingCompany = await prisma.company.findUnique({ where: { email } });
      if (existingCompany) {
        return res.status(409).json({ error: 'Company already registered with this email' });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create company
      const company = await prisma.company.create({
        data: {
          name,
          email,
          passwordHash,
          industry,
          companySize: size
        },
        select: {
          id: true,
          name: true,
          email: true,
          industry: true,
          companySize: true,
          createdAt: true
        }
      });

      // Generate JWT
      const token = jwt.sign(
        { companyId: company.id, email: company.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        message: 'Company registered successfully',
        token,
        company
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/auth/login - Company login
router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Find company
      const company = await prisma.company.findUnique({ where: { email } });
      if (!company) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, company.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Generate JWT
      const token = jwt.sign(
        { companyId: company.id, email: company.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        message: 'Login successful',
        token,
        company: {
          id: company.id,
          name: company.name,
          email: company.email,
          industry: company.industry,
          companySize: company.companySize
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/auth/me - Get current company profile
router.get('/me', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        industry: true,
        companySize: true,
        createdAt: true,
        _count: {
          select: {
            employees: true,
            attritionReports: true
          }
        }
      }
    });

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json({ company });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
