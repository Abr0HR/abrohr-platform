const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const { format, isWeekend, parse: parseDate } = require('date-fns');

const REQUIRED_COLUMNS = [
  'employee_id',
  'employee_name',
  'date',
  'status',
  'informed_time',
  'department',
  'manager_email'
];

const VALID_STATUSES = ['Present', 'Planned Leave', 'Unplanned Leave', 'Absent'];

class FileParserService {
  
  parseFile(buffer, filename) {
    const ext = filename.split('.').pop().toLowerCase();
    
    if (ext === 'csv') {
      return this.parseCSV(buffer);
    } else if (['xlsx', 'xls'].includes(ext)) {
      return this.parseExcel(buffer);
    } else {
      throw new Error('Unsupported file format. Only CSV and Excel files are allowed.');
    }
  }
  
  parseCSV(buffer) {
    try {
      const records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
      return this.validateAndNormalize(records);
    } catch (error) {
      throw new Error(`CSV parsing failed: ${error.message}`);
    }
  }
  
  parseExcel(buffer) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const records = XLSX.utils.sheet_to_json(worksheet);
      return this.validateAndNormalize(records);
    } catch (error) {
      throw new Error(`Excel parsing failed: ${error.message}`);
    }
  }
  
  validateAndNormalize(records) {
    const errors = [];
    const validRecords = [];
    const seenKeys = new Set();
    
    if (records.length === 0) {
      throw new Error('File is empty');
    }
    
    // Check columns
    const columns = Object.keys(records[0]);
    const missingColumns = REQUIRED_COLUMNS.filter(col => !columns.includes(col));
    
    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
    }
    
    // Validate each record
    records.forEach((record, index) => {
      const rowNumber = index + 2; // +2 for header and 0-index
      const rowErrors = [];
      
      // Validate employee_id
      if (!record.employee_id || record.employee_id.trim() === '') {
        rowErrors.push('employee_id is required');
      } else if (record.employee_id.length > 20) {
        rowErrors.push('employee_id must be max 20 characters');
      }
      
      // Validate employee_name
      if (!record.employee_name || record.employee_name.trim() === '') {
        rowErrors.push('employee_name is required');
      } else if (record.employee_name.length > 100) {
        rowErrors.push('employee_name must be max 100 characters');
      }
      
      // Validate date
      let parsedDate;
      try {
        parsedDate = parseDate(record.date, 'yyyy-MM-dd', new Date());
        if (isNaN(parsedDate.getTime())) {
          rowErrors.push('date must be in YYYY-MM-DD format');
        } else if (isWeekend(parsedDate)) {
          rowErrors.push('date cannot be a weekend (Saturday/Sunday)');
        }
      } catch (e) {
        rowErrors.push('date must be in YYYY-MM-DD format');
      }
      
      // Validate status
      if (!VALID_STATUSES.includes(record.status)) {
        rowErrors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
      }
      
      // Validate informed_time
      if (record.status === 'Planned Leave' || record.status === 'Unplanned Leave') {
        if (!record.informed_time) {
          rowErrors.push('informed_time is required for leave records');
        } else {
          try {
            const informedDate = new Date(record.informed_time);
            if (isNaN(informedDate.getTime())) {
              rowErrors.push('informed_time must be valid datetime');
            } else if (record.status === 'Planned Leave' && informedDate > parsedDate) {
              rowErrors.push('informed_time must be before the leave date for planned leave');
            } else if (record.status === 'Unplanned Leave') {
              const timeDiff = Math.abs(parsedDate - informedDate) / (1000 * 60 * 60);
              if (timeDiff > 24) {
                rowErrors.push('informed_time must be within 24 hours of date for unplanned leave');
              }
            }
          } catch (e) {
            rowErrors.push('informed_time format is invalid');
          }
        }
      }
      
      // Validate department
      if (!record.department || record.department.trim() === '') {
        rowErrors.push('department is required');
      } else if (record.department.length > 50) {
        rowErrors.push('department must be max 50 characters');
      }
      
      // Validate manager_email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!record.manager_email || !emailRegex.test(record.manager_email)) {
        rowErrors.push('manager_email must be a valid email address');
      }
      
      // Check for duplicates
      const key = `${record.employee_id}_${record.date}`;
      if (seenKeys.has(key)) {
        rowErrors.push('duplicate employee_id + date combination');
      } else {
        seenKeys.add(key);
      }
      
      if (rowErrors.length > 0) {
        errors.push({
          row: rowNumber,
          errors: rowErrors
        });
      } else {
        validRecords.push({
          employeeId: record.employee_id.trim(),
          employeeName: record.employee_name.trim(),
          date: parsedDate,
          status: record.status,
          informedTime: record.informed_time ? new Date(record.informed_time) : null,
          department: record.department.trim(),
          managerEmail: record.manager_email.trim().toLowerCase()
        });
      }
    });
    
    // Validate 3-month period (approximately 63 working days)
    const employeeGroups = {};
    validRecords.forEach(record => {
      if (!employeeGroups[record.employeeId]) {
        employeeGroups[record.employeeId] = [];
      }
      employeeGroups[record.employeeId].push(record);
    });
    
    Object.entries(employeeGroups).forEach(([empId, records]) => {
      if (records.length < 55 || records.length > 70) {
        errors.push({
          employee: empId,
          errors: [`Employee must have approximately 63 working days of data (3 months, 5-day week). Found ${records.length} days.`]
        });
      }
    });
    
    return {
      valid: errors.length === 0,
      validRecords,
      invalidRecords: errors.length,
      errors
    };
  }
}

module.exports = new FileParserService();
