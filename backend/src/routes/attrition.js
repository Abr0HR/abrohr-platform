const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { calculateAttritionRisk, generateAttritionReport } = require('../services/attritionEngine');

const prisma = new PrismaClient();

// GET /api/attrition/report - Generate full attrition report for company
router.get('/report', async (req, res) => {
  try {
    const { months = 3 } = req.query;
    
    const report = await generateAttritionReport(req.companyId, parseInt(months));
    
    // Save report to database
    const savedReport = await prisma.attritionReport.create({
      data: {
        companyId: req.companyId,
        period: report.period,
        totalEmployees: report.totalEmployees,
        highRiskCount: report.summary.high,
        moderateRiskCount: report.summary.moderate,
        lowRiskCount: report.summary.low,
        reportData: report
      }
    });

    res.json({
      message: 'Attrition report generated successfully',
      reportId: savedReport.id,
      report
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/attrition/employee/:employeeId - Get attrition risk for specific employee
router.get('/employee/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { months = 3 } = req.query;

    // Find employee by employeeId string
    const employee = await prisma.employee.findFirst({
      where: {
        employeeId,
        companyId: req.companyId
      }
    });

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const risk = await calculateAttritionRisk(employee.id, parseInt(months));

    res.json({ risk });
  } catch (error) {
    console.error('Calculate risk error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/attrition/high-risk - Get employees with high attrition risk
router.get('/high-risk', async (req, res) => {
  try {
    const { months = 3, threshold = 70 } = req.query;
    
    const report = await generateAttritionReport(req.companyId, parseInt(months));
    const highRiskEmployees = report.employees.filter(e => e.score >= parseInt(threshold));

    res.json({
      count: highRiskEmployees.length,
      threshold: parseInt(threshold),
      employees: highRiskEmployees
    });
  } catch (error) {
    console.error('High risk query error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/attrition/history - Get past attrition reports
router.get('/history', async (req, res) => {
  try {
    const reports = await prisma.attritionReport.findMany({
      where: { companyId: req.companyId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    res.json({ reports });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
