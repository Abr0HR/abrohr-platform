/**
 * Attrition Risk Scoring Engine
 * Theory-backed approach using:
 * 1. Job Embeddedness Theory (Mitchell et al., 2001)
 * 2. Conservation of Resources (COR) Theory (Hobfoll, 1989)
 * 3. Effort-Reward Imbalance (ERI) Model (Siegrist, 1996)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Calculate attrition risk score for an employee
 * @param {string} employeeId - Employee ID
 * @param {number} months - Number of months to analyze (default: 3)
 * @returns {Promise<Object>} Attrition risk assessment
 */
async function calculateAttritionRisk(employeeId, months = 3) {
  // Fetch attendance data for the specified period
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      attendance: {
        where: {
          date: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { date: 'asc' }
      },
      company: true
    }
  });

  if (!employee) {
    throw new Error('Employee not found');
  }

  const attendanceRecords = employee.attendance;
  
  if (attendanceRecords.length === 0) {
    return {
      employeeId: employee.employeeId,
      name: employee.name,
      score: 0,
      riskLevel: 'Insufficient Data',
      factors: {},
      recommendation: 'Need at least 3 months of attendance data'
    };
  }

  // Calculate individual risk factors
  const absenteeismScore = calculateAbsenteeismScore(attendanceRecords);
  const leavePatternScore = calculateLeavePatternScore(attendanceRecords);
  const consistencyScore = calculateConsistencyScore(attendanceRecords);
  const recentTrendScore = calculateRecentTrendScore(attendanceRecords);

  // Weighted composite score (0-100)
  const weights = {
    absenteeism: 0.35,    // Highest weight - direct indicator
    leavePattern: 0.25,   // Unplanned leaves indicate disengagement
    consistency: 0.25,    // Erratic patterns suggest instability
    recentTrend: 0.15     // Recent behavior is predictive
  };

  const compositeScore = (
    absenteeismScore * weights.absenteeism +
    leavePatternScore * weights.leavePattern +
    consistencyScore * weights.consistency +
    recentTrendScore * weights.recentTrend
  );

  // Determine risk level
  const riskLevel = determineRiskLevel(compositeScore);

  return {
    employeeId: employee.employeeId,
    name: employee.name,
    email: employee.email,
    score: Math.round(compositeScore * 10) / 10,
    riskLevel,
    factors: {
      absenteeism: Math.round(absenteeismScore * 10) / 10,
      leavePattern: Math.round(leavePatternScore * 10) / 10,
      consistency: Math.round(consistencyScore * 10) / 10,
      recentTrend: Math.round(recentTrendScore * 10) / 10
    },
    statistics: calculateStatistics(attendanceRecords),
    recommendation: generateRecommendation(riskLevel, compositeScore)
  };
}

/**
 * Calculate absenteeism score based on absent days
 * Higher score = higher risk
 */
function calculateAbsenteeismScore(records) {
  const totalDays = records.length;
  const absentDays = records.filter(r => r.status === 'Absent').length;
  const absentRate = absentDays / totalDays;

  // Score increases exponentially with absent rate
  if (absentRate >= 0.20) return 100; // 20%+ absent = critical
  if (absentRate >= 0.15) return 85;
  if (absentRate >= 0.10) return 65;
  if (absentRate >= 0.05) return 40;
  return absentRate * 800; // Linear for low rates
}

/**
 * Calculate leave pattern score
 * Unplanned leaves indicate lower job embeddedness
 */
function calculateLeavePatternScore(records) {
  const totalLeaves = records.filter(r => 
    r.status === 'Planned Leave' || r.status === 'Unplanned Leave'
  ).length;
  
  if (totalLeaves === 0) return 0;

  const unplannedLeaves = records.filter(r => r.status === 'Unplanned Leave').length;
  const unplannedRatio = unplannedLeaves / totalLeaves;

  // High unplanned leave ratio suggests disengagement
  if (unplannedRatio >= 0.80) return 90;
  if (unplannedRatio >= 0.60) return 70;
  if (unplannedRatio >= 0.40) return 50;
  if (unplannedRatio >= 0.20) return 30;
  return unplannedRatio * 100;
}

/**
 * Calculate consistency score
 * Erratic patterns (high variance) indicate instability
 */
function calculateConsistencyScore(records) {
  // Group by week and calculate weekly absent rates
  const weeklyRates = [];
  let currentWeek = [];
  
  records.forEach((record, index) => {
    currentWeek.push(record);
    
    if (currentWeek.length === 5 || index === records.length - 1) {
      const weekAbsentRate = currentWeek.filter(r => r.status === 'Absent').length / currentWeek.length;
      weeklyRates.push(weekAbsentRate);
      currentWeek = [];
    }
  });

  if (weeklyRates.length < 2) return 0;

  // Calculate standard deviation
  const mean = weeklyRates.reduce((a, b) => a + b, 0) / weeklyRates.length;
  const variance = weeklyRates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / weeklyRates.length;
  const stdDev = Math.sqrt(variance);

  // Higher standard deviation = higher score (more erratic)
  return Math.min(stdDev * 200, 100);
}

/**
 * Calculate recent trend score
 * Recent deterioration is highly predictive
 */
function calculateRecentTrendScore(records) {
  if (records.length < 20) return 0;

  // Compare last 3 weeks vs previous period
  const recentRecords = records.slice(-15); // Last 3 weeks
  const previousRecords = records.slice(-30, -15); // Previous 3 weeks

  const recentAbsentRate = recentRecords.filter(r => r.status === 'Absent').length / recentRecords.length;
  const previousAbsentRate = previousRecords.filter(r => r.status === 'Absent').length / previousRecords.length;

  const trend = recentAbsentRate - previousAbsentRate;

  // Worsening trend = higher score
  if (trend >= 0.15) return 100;
  if (trend >= 0.10) return 75;
  if (trend >= 0.05) return 50;
  if (trend > 0) return trend * 500;
  return 0; // Improving trend = no risk
}

/**
 * Determine risk level from composite score
 */
function determineRiskLevel(score) {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Moderate';
  return 'Low';
}

/**
 * Calculate attendance statistics
 */
function calculateStatistics(records) {
  const total = records.length;
  const present = records.filter(r => r.status === 'Present').length;
  const absent = records.filter(r => r.status === 'Absent').length;
  const plannedLeave = records.filter(r => r.status === 'Planned Leave').length;
  const unplannedLeave = records.filter(r => r.status === 'Unplanned Leave').length;

  return {
    totalDays: total,
    presentDays: present,
    absentDays: absent,
    plannedLeaveDays: plannedLeave,
    unplannedLeaveDays: unplannedLeave,
    attendanceRate: ((present / total) * 100).toFixed(2) + '%',
    absenteeismRate: ((absent / total) * 100).toFixed(2) + '%'
  };
}

/**
 * Generate actionable recommendation
 */
function generateRecommendation(riskLevel, score) {
  if (riskLevel === 'High') {
    return 'URGENT: Schedule immediate 1-on-1 meeting. Investigate causes of absenteeism. Consider retention strategies.';
  } else if (riskLevel === 'Moderate') {
    return 'MONITOR: Regular check-ins recommended. Address any workplace concerns proactively.';
  } else {
    return 'LOW RISK: Continue standard engagement practices. Employee shows stable attendance.';
  }
}

/**
 * Generate attrition report for multiple employees
 */
async function generateAttritionReport(companyId, months = 3) {
  const employees = await prisma.employee.findMany({
    where: { companyId },
    include: {
      attendance: {
        where: {
          date: {
            gte: new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000)
          }
        }
      }
    }
  });

  const results = [];
  
  for (const employee of employees) {
    try {
      const risk = await calculateAttritionRisk(employee.id, months);
      results.push(risk);
    } catch (error) {
      console.error(`Error calculating risk for employee ${employee.id}:`, error);
    }
  }

  // Sort by risk score (highest first)
  results.sort((a, b) => b.score - a.score);

  return {
    companyId,
    generatedAt: new Date(),
    period: `${months} months`,
    totalEmployees: employees.length,
    summary: {
      high: results.filter(r => r.riskLevel === 'High').length,
      moderate: results.filter(r => r.riskLevel === 'Moderate').length,
      low: results.filter(r => r.riskLevel === 'Low').length
    },
    employees: results
  };
}

module.exports = {
  calculateAttritionRisk,
  generateAttritionReport
};
