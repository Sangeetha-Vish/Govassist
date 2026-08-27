/**
 * GovAssist AI — Single Bulk Query Audit & Backfill Scheme Journey Metadata
 */

const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function auditAndBackfill() {
  console.log('=' .repeat(65));
  console.log('GovAssist AI — Fast Bulk Auditing and Backfilling 95 Schemes');
  console.log('=' .repeat(65));

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const result = await client.query('SELECT scheme_id, scheme_name, category, target_group, location_scope, application_url, source_url FROM schemes');
  const schemes = result.rows;

  let fixedCount = 0;
  let rollingCount = 0;

  // Build bulk VALUES string
  const valuesRows = [];
  const params = [];
  let pIdx = 1;

  for (let i = 0; i < schemes.length; i++) {
    const s = schemes[i];
    const sId = s.scheme_id;
    const name = s.scheme_name || '';
    const cat = (s.category || '').toLowerCase();
    const appUrl = s.application_url || s.source_url || 'https://www.india.gov.in';

    let agency = '';
    let disbursement = '';
    let steps = [];
    let deadlineType = 'rolling';
    let appWindow = '';
    let trackingUrl = '';
    let helpline = '';

    // 1. Agency
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

    // 2. Disbursement
    if (cat.includes('student') || cat.includes('education') || name.includes('Scholarship') || name.includes('Fellowship')) {
      disbursement = 'Direct Benefit Transfer (DBT) directly into the verified student bank account linked with Aadhaar in annual installments.';
    } else if (cat.includes('startup') || cat.includes('business') || name.includes('Subsidy') || name.includes('MUDRA')) {
      disbursement = 'Capital subsidy credited directly through lending commercial banks / financial institutions upon loan sanction and milestone verification.';
    } else if (cat.includes('social') || name.includes('Pension') || name.includes('Assistance')) {
      disbursement = 'Monthly Direct Benefit Transfer (DBT) credited directly to beneficiary bank/post-office account.';
    } else {
      disbursement = 'Direct electronic transfer to verified bank account after nodal officer verification.';
    }

    // 3. Steps
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
        { step: 2, title: 'Online Application Submission', desc: `Submit application on official portal (${appUrl}) with business registration proof.` },
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

    // 4. Deadlines
    if (name.includes('Pragati') || name.includes('AICTE') || name.includes('NSP') || name.includes('Scholarship')) {
      deadlineType = 'fixed_annual';
      appWindow = 'Annual Academic Window: Opens July/August and typically closes October 31 annually (subject to portal extensions).';
      fixedCount++;
    } else {
      deadlineType = 'rolling';
      appWindow = 'Year-round Open Application Window (Applications accepted and processed continuously).';
      rollingCount++;
    }

    // 5. Tracking
    if (appUrl.includes('scholarships.gov.in')) {
      trackingUrl = 'https://scholarships.gov.in/fresh/newstdRegfrmInstruction';
    } else if (appUrl.includes('msme') || name.includes('MUDRA')) {
      trackingUrl = 'https://www.udyamimitra.in/';
    } else {
      trackingUrl = appUrl;
    }

    // 6. Helpline
    if (name.includes('AICTE') || name.includes('Scholarship')) {
      helpline = 'NSP National Helpdesk: 0120-6619540 | Email: helpdesk@nsp.gov.in';
    } else if (s.location_scope === 'tamil_nadu') {
      helpline = 'Tamil Nadu MSME / Citizen Helpline: 1800-425-4737';
    } else {
      helpline = 'National Citizen Portal Helpline: 1800-11-5555';
    }

    params.push(sId, agency, disbursement, JSON.stringify(steps), deadlineType, appWindow, trackingUrl, helpline);
    valuesRows.push(`($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}::jsonb, $${pIdx+4}, $${pIdx+5}, $${pIdx+6}, $${pIdx+7})`);
    pIdx += 8;
  }

  const bulkQuery = `
    UPDATE schemes AS s SET
      implementing_agency = v.agency,
      disbursement_process = v.disbursement,
      application_steps = v.steps,
      deadline_type = v.deadline_type,
      application_window = v.app_window,
      tracking_portal_url = v.tracking_url,
      helpline_info = v.helpline,
      updated_at = NOW()
    FROM (VALUES
      ${valuesRows.join(',\n      ')}
    ) AS v(scheme_id, agency, disbursement, steps, deadline_type, app_window, tracking_url, helpline)
    WHERE s.scheme_id = v.scheme_id;
  `;

  await client.query(bulkQuery, params);
  await client.end();

  console.log(`✓ Bulk update succeeded in a single query for all ${schemes.length} schemes!`);
  console.log(`  - Fixed Annual Intake: ${fixedCount}`);
  console.log(`  - Open Rolling Intake: ${rollingCount}`);
  console.log('=' .repeat(65));
}

auditAndBackfill().catch(err => {
  console.error('Bulk update failed:', err);
  process.exit(1);
});
