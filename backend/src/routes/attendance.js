const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const xlsx = require('xlsx');
const { body, validationResult } = require('express-validator');

const prisma = new PrismaClient();

// Configure multer for file uploads (memory storage)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel and CSV files are allowed.'));
    }
  }
});

// POST /api/attendance/upload - Upload attendance data
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse Excel/CSV file
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (!data || data.length === 0) {
      return res.status(400).json({ error: 'File is empty or invalid format' });
    }

    // Validate required columns
    const requiredColumns = ['employeeId', 'name', 'date', 'status'];
    const firstRow = data[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));
    
    if (missingColumns.length > 0) {
      return res.status(400).json({ 
        error: `Missing required columns: ${missingColumns.join(', ')}`,
        expectedFormat: {
          employeeId: 'Unique employee identifier',
          name: 'Employee name',
          date: 'Date (YYYY-MM-DD)',
          status: 'Attendance status (Planned Leave / Unplanned Leave / Absent / Present)'
        }
      });
    }

    // Process attendance records
    const processedRecords = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const { employeeId, name, date, status } = row;

      // Validate status
      const validStatuses = ['Planned Leave', 'Unplanned Leave', 'Absent', 'Present'];
      if (!validStatuses.includes(status)) {
        errors.push(`Row ${i + 2}: Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}`);
        continue;
      }

      // Validate date
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        errors.push(`Row ${i + 2}: Invalid date format '${date}'. Expected YYYY-MM-DD`);
        continue;
      }

      // Find or create employee
      let employee = await prisma.employee.findFirst({
        where: {
          employeeId: String(employeeId),
          companyId: req.companyId
        }
      });

      if (!employee) {
        employee = await prisma.employee.create({
          data: {
            employeeId: String(employeeId),
            name: String(name),
            companyId: req.companyId
          }
        });
      }

      // Create or update attendance record
      const attendance = await prisma.attendance.upsert({
        where: {
          employeeId_date: {
            employeeId: employee.id,
            date: parsedDate
          }
        },
        update: {
          status
        },
        create: {
          employeeId: employee.id,
          date: parsedDate,
          status
        }
      });

      processedRecords.push({
        employeeId: employee.employeeId,
        name: employee.name,
        date: parsedDate.toISOString().split('T')[0],
        status
      });
    }

    res.status(200).json({
      message: 'Attendance data uploaded successfully',
      processed: processedRecords.length,
      errors: errors.length > 0 ? errors : undefined,
      records: processedRecords
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// GET /api/attendance - Get attendance records
router.get('/', async (req, res) => {
  try {
    const { employeeId, startDate, endDate } = req.query;

    const where = {
      employee: {
        companyId: req.companyId
      }
    };

    if (employeeId) {
      where.employee.employeeId = employeeId;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const attendance = await prisma.attendance.findMany({
      where,
      include: {
        employee: {
          select: {
            employeeId: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });

    res.json({ attendance });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
