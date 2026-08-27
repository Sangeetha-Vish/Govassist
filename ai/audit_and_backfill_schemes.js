/**
 * GovAssist AI — Fast Batch Audit & Backfill Scheme Journey Metadata
 */

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

async function auditAndBackfill() {
  console.log('=' .repeat(65));
  console.log('GovAssist AI — Fast Batch Auditing and Backfilling 95 Schemes');
  console.log('=' .repeat(65));

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 30000,
  });

  await client.connect();

  const result = await client.query('SELECT * FROM schemes ORDER BY scheme_name');
  const schemes = result.rows;

  let fixedCount = 0;
  let rollingCount = 0;

  // Build batch SQL with parameterized values
  for (let i = 0; i < schemes.length; i++) {
    const s = schemes[i];
    const sId = s.scheme_id;
    const name = s.scheme_name || '';
    const cat = (s.category || '').toLowerCase();
    const appUrl = s.application_url || s.source_url || 'https://www.india.gov.in';

    let agency = s.implementing_agency;
    let disbursement = s.disbursement_process;
    let steps = s.application_steps;
    let deadlineType = s.deadline_type || 'rolling';
    let appWindow = s.application_window;
    let trackingUrl = s.tracking_portal_url;
    let helpline = s.helpline_info;

    // 1. Agency
    if (!agency) {
      if (name.includes('AICTE') || cat.includes('student') || cat.includes('education')) {
        agency = 'All India Council for Technical Education (AICTE) / Ministry of Education';
      } else if (name.includes('Tamil Nadu') || s.location_scope === 'tamil_nadu' || name.includes('AABCS') || name.includes('UYEGP') || name.includes('NEEDS')) {
        agency = 'Government of Tamil Nadu — MSME & Social Welfare Department / StartupTN';
      } else if (name.includes('MUDRA') || name.includes('PMEGP') || cat.includes('startup') || cat.includes('business')) {
        agency = 'Ministry of MSME / Small Industries Development Bank of India (SIDBI)';
      } else if (name.includes('Awas') || cat.includes('house')) {
        agency = 'Ministry of Housing and Urban Affairs (MoHUA)';
      } else {
        agency = 'Central / State Government Nodal Department';
      }
    }

    // 2. Disbursement
    if (!disbursement) {
      if (cat.includes('student') || cat.includes('education') || name.includes('Scholarship') || name.includes('Fellowship')) {
        disbursement = 'Direct Benefit Transfer (DBT) directly into the verified student bank account linked with Aadhaar in annual installments.';
      } else if (cat.includes('startup') || cat.includes('business') || name.includes('Subsidy') || name.includes('MUDRA')) {
        disbursement = 'Capital subsidy credited directly through lending commercial banks / financial institutions upon loan sanction and milestone verification.';
      } else if (cat.includes('social') || name.includes('Pension') || name.includes('Assistance')) {
        disbursement = 'Monthly Direct Benefit Transfer (DBT) credited directly to beneficiary bank/post-office account.';
      } else {
        disbursement = 'Direct electronic transfer to verified bank account after nodal officer verification.';
      }
    }

    // 3. Application Steps Breakdown
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      if (cat.includes('student') || name.includes('Scholarship') || name.includes('AICTE')) {
        steps = [
          { step: 1, title: 'National Portal Registration', desc: 'Register on the official National Scholarship Portal (scholarships.gov.in) with Aadhaar and mobile number.' },
          { step: 2, title: 'Fill Application & College Details', desc: 'Enter academic admission details, annual family income, and institutional enrollment verification.' },
          { step: 3, title: 'Upload Verified Documents', desc: 'Upload Income Certificate, 10th/12th marksheets, and Bank Passbook copy.' },
          { step: 4, title: 'Institute & Nodal Verification', desc: 'Your college/polytechnic nodal officer verifies your enrollment electronically.' },
          { step: 5, title: 'Sanction & DBT Credit', desc: 'Upon approval, scholarship amount is directly credited to your Aadhaar-seeded bank account.' }
        ];
      } else if (cat.includes('startup') || cat.includes('business') || name.includes('AABCS') || name.includes('MUDRA')) {
        steps = [
          { step: 1, title: 'Project Report Preparation', desc: 'Prepare your business plan, machinery quotations, and required project capital estimate.' },
          { step: 2, title: 'Online Application Submission', desc: `Submit application on the official portal (${appUrl}) with business registration proof.` },
          { step: 3, title: 'Document Verification by DIC', desc: 'District Industries Centre (DIC) or Task Force Committee evaluates project viability.' },
          { step: 4, title: 'Bank Loan Sanction', desc: 'Approved proposal is forwarded to participating bank branch for loan release.' },
          { step: 5, title: 'Subsidy Release', desc: 'Government capital subsidy is credited to your bank loan account.' }
        ];
      } else {
        steps = [
          { step: 1, title: 'Citizen Portal Registration', desc: 'Create your citizen profile on the official government portal.' },
          { step: 2, title: 'Check Mandatory Criteria', desc: 'Verify your age, residency, and income limits match scheme rules.' },
          { step: 3, title: 'Submit Supporting Documents', desc: 'Attach verified identity, address, and community/income certificates.' },
          { step: 4, title: 'Field / Nodal Officer Review', desc: 'Department officer processes and verifies uploaded records.' },
          { step: 5, title: 'Approval & Benefit Delivery', desc: 'Official sanction order is issued and benefits are disbursed.' }
        ];
      }
    }

    // 4. Deadlines & Timelines
    if (name.includes('Pragati') || name.includes('AICTE') || name.includes('NSP') || name.includes('Scholarship')) {
      deadlineType = 'fixed_annual';
      appWindow = 'Annual Academic Window: Opens July/August and typically closes October 31 annually (subject to portal extensions).';
      fixedCount++;
    } else {
      deadlineType = 'rolling';
      appWindow = 'Year-round Open Application Window (Applications accepted and processed continuously).';
      rollingCount++;
    }

    // 5. Tracking URL
    if (!trackingUrl) {
      if (appUrl.includes('scholarships.gov.in')) {
        trackingUrl = 'https://scholarships.gov.in/fresh/newstdRegfrmInstruction';
      } else if (appUrl.includes('msme') || name.includes('MUDRA')) {
        trackingUrl = 'https://www.udyamimitra.in/';
      } else {
        trackingUrl = appUrl;
      }
    }

    // 6. Helpline Info
    if (!helpline) {
      if (name.includes('AICTE') || name.includes('Scholarship')) {
        helpline = 'NSP National Helpdesk: 0120-6619540 | Email: helpdesk@nsp.gov.in';
      } else if (s.location_scope === 'tamil_nadu') {
        helpline = 'Tamil Nadu MSME / Citizen Helpline: 1800-425-4737';
      } else {
        helpline = 'National Citizen Portal Helpline: 1800-11-5555';
      }
    }

    await client.query(
      `UPDATE schemes SET
        implementing_agency = $1,
        disbursement_process = $2,
        application_steps = $3,
        deadline_type = $4,
        application_window = $5,
        tracking_portal_url = $6,
        helpline_info = $7,
        updated_at = NOW()
      WHERE scheme_id = $8`,
      [agency, disbursement, JSON.stringify(steps), deadlineType, appWindow, trackingUrl, helpline, sId]
    );
  }

  await client.end();

  console.log(`✓ Backfill complete for all ${schemes.length} schemes.`);
  console.log(`  - Fixed Annual Cycle Schemes: ${fixedCount}`);
  console.log(`  - Rolling / Year-Round Schemes: ${rollingCount}`);
  console.log('=' .repeat(65));
}

auditAndBackfill().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
