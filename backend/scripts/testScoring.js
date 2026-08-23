const {
  rankSchemes,
} = require("../src/services/scoringService");

const profile = {
  age: 22,
  education: "B.E",
  family_income: 180000,
  location: "Tamil Nadu",
  employment_status: "student",
  category: "student",
  work_experience_years: 0,
};

const schemes = [
  {
    scheme_id: "TEST001",
    scheme_name: "Test Student Scheme",
    category: "student",
    min_age: 18,
    max_age: 25,
    education_min: "B.E",
    max_family_income: 300000,
  },
  {
    scheme_id: "TEST002",
    scheme_name: "Test Income Scheme",
    category: "student",
    min_age: 18,
    max_age: 30,
    education_min: "B.E",
    max_family_income: 100000,
  },
];

const results = rankSchemes(profile, schemes);

console.log("\nSCORING RESULTS\n");
console.table(results);