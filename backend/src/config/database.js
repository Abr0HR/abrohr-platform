import pg from 'pg';
const { Pool } = pg;

// PostgreSQL connection configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

// Initialize database tables
export async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Initializing database tables...');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        organization_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      );
    `);
    console.log('✅ Users table ready');

    // Create attendance_uploads table
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_uploads (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        row_count INTEGER,
        status VARCHAR(50) DEFAULT 'processing',
        error_message TEXT
      );
    `);
    console.log('✅ Attendance uploads table ready');

    // Create attendance_records table
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id SERIAL PRIMARY KEY,
        upload_id INTEGER REFERENCES attendance_uploads(id) ON DELETE CASCADE,
        employee_id VARCHAR(100) NOT NULL,
        employee_name VARCHAR(255),
        date DATE NOT NULL,
        status VARCHAR(50),
        hours_worked DECIMAL(5,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(upload_id, employee_id, date)
      );
    `);
    console.log('✅ Attendance records table ready');

    // Create analysis_results table
    await client.query(`
      CREATE TABLE IF NOT EXISTS analysis_results (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        upload_id INTEGER REFERENCES attendance_uploads(id) ON DELETE CASCADE,
        employee_id VARCHAR(100) NOT NULL,
        employee_name VARCHAR(255),
        attrition_risk_score DECIMAL(5,2),
        attrition_risk_level VARCHAR(50),
        attendance_rate DECIMAL(5,2),
        absence_days INTEGER,
        late_arrivals INTEGER,
        job_embeddedness_score DECIMAL(5,2),
        conservation_of_resources_score DECIMAL(5,2),
        effort_reward_imbalance_score DECIMAL(5,2),
        recommendations TEXT,
        analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(upload_id, employee_id)
      );
    `);
    console.log('✅ Analysis results table ready');

    // Create reports table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        analysis_id INTEGER REFERENCES analysis_results(id) ON DELETE CASCADE,
        report_type VARCHAR(50) NOT NULL,
        file_path VARCHAR(500),
        file_format VARCHAR(20),
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Reports table ready');

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance_records(employee_id);
      CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);
      CREATE INDEX IF NOT EXISTS idx_analysis_employee ON analysis_results(employee_id);
      CREATE INDEX IF NOT EXISTS idx_analysis_risk ON analysis_results(attrition_risk_level);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    console.log('✅ Database indexes created');

    console.log('✅ Database initialization complete');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    throw error;
  } finally {
    client.release();
  }
}

export { pool };
