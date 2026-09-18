/* ========== Countries, Currencies, Mock Employees ========== */
const COUNTRIES = [
  { code: "NG", name: "Nigeria", currency: "NGN", lang: "en" },
  { code: "US", name: "United States", currency: "USD", lang: "en" },
  { code: "GB", name: "United Kingdom", currency: "GBP", lang: "en" },
  { code: "CA", name: "Canada", currency: "CAD", lang: "en" },
  { code: "AE", name: "United Arab Emirates", currency: "AED", lang: "ar" },
  { code: "SA", name: "Saudi Arabia", currency: "AED", lang: "ar" },
  { code: "IN", name: "India", currency: "INR", lang: "hi" },
  { code: "CN", name: "China", currency: "CNY", lang: "zh" },
  { code: "JP", name: "Japan", currency: "JPY", lang: "ja" },
  { code: "DE", name: "Germany", currency: "EUR", lang: "de" },
  { code: "FR", name: "France", currency: "EUR", lang: "fr" },
  { code: "ES", name: "Spain", currency: "EUR", lang: "es" },
  { code: "BR", name: "Brazil", currency: "BRL", lang: "pt" },
  { code: "ZA", name: "South Africa", currency: "ZAR", lang: "en" },
  { code: "KE", name: "Kenya", currency: "KES", lang: "en" },
  { code: "GH", name: "Ghana", currency: "GHS", lang: "en" },
  { code: "PH", name: "Philippines", currency: "USD", lang: "en" },
  { code: "AU", name: "Australia", currency: "AUD", lang: "en" },
  { code: "SG", name: "Singapore", currency: "USD", lang: "en" },
  { code: "MX", name: "Mexico", currency: "USD", lang: "es" },
  { code: "EG", name: "Egypt", currency: "USD", lang: "ar" },
  { code: "PK", name: "Pakistan", currency: "USD", lang: "en" },
  { code: "BD", name: "Bangladesh", currency: "USD", lang: "en" },
  { code: "ID", name: "Indonesia", currency: "USD", lang: "en" },
  { code: "TR", name: "Turkey", currency: "USD", lang: "en" },
  { code: "IT", name: "Italy", currency: "EUR", lang: "en" },
  { code: "NL", name: "Netherlands", currency: "EUR", lang: "en" },
  { code: "PL", name: "Poland", currency: "EUR", lang: "en" },
  { code: "RU", name: "Russia", currency: "USD", lang: "en" },
  { code: "KR", name: "South Korea", currency: "USD", lang: "en" }
];

/* Exchange: ngnPerUnit = how many NGN equal 1 unit of that currency.
   Base fee is always ₦100; other currencies show the equivalent.
   Admin can revise BASE_PRICE_NGN or these rates from time to time. */
const CURRENCIES = {
  NGN: { symbol: "₦", ngnPerUnit: 1,     name: "Nigerian Naira" },
  USD: { symbol: "$", ngnPerUnit: 1550,  name: "US Dollar" },
  EUR: { symbol: "€", ngnPerUnit: 1680,  name: "Euro" },
  GBP: { symbol: "£", ngnPerUnit: 1950,  name: "British Pound" },
  INR: { symbol: "₹", ngnPerUnit: 18.5,  name: "Indian Rupee" },
  JPY: { symbol: "¥", ngnPerUnit: 10.5,  name: "Japanese Yen" },
  CNY: { symbol: "¥", ngnPerUnit: 215,   name: "Chinese Yuan" },
  BRL: { symbol: "R$", ngnPerUnit: 280,  name: "Brazilian Real" },
  AED: { symbol: "د.إ", ngnPerUnit: 422, name: "UAE Dirham" },
  ZAR: { symbol: "R", ngnPerUnit: 85,    name: "South African Rand" },
  CAD: { symbol: "C$", ngnPerUnit: 1120, name: "Canadian Dollar" },
  AUD: { symbol: "A$", ngnPerUnit: 1000, name: "Australian Dollar" },
  GHS: { symbol: "GH₵", ngnPerUnit: 100, name: "Ghanaian Cedi" },
  KES: { symbol: "KSh", ngnPerUnit: 12,  name: "Kenyan Shilling" }
};

const BASE_PRICE_NGN = 100;
const PRICE_CURRENCY = "NGN";
let BASE_PRICE_USD = BASE_PRICE_NGN / CURRENCIES.USD.ngnPerUnit; // derived
const PRICE_REVIEW_NOTE = "Fee is ₦100 (or equivalent in your currency). Exchange rates update automatically and may be reviewed from time to time.";


/* Education ranking for filtering */
const EDU_RANK = {
  "Primary / Elementary": 1,
  "Secondary / High School": 2,
  "Diploma / Certificate": 3,
  "Bachelor’s Degree": 4,
  "Master’s Degree": 5,
  "Doctorate / PhD": 6,
  "Professional Certification": 3,
  "Other": 1
};


/* ========== Country-specific employment form rules ==========
 * Drives required fields, ID types, and employer search filters
 * by selected country. "default" applies when country has no override.
 */
const COUNTRY_FORM_RULES = {
  default: {
    idTypes: [
      "National ID Card",
      "Passport",
      "Driver's License",
      "Social Security / National Insurance",
      "Other Government Issued ID"
    ],
    idLabel: "ID Number",
    idPlaceholder: "Enter government ID number",
    employeeExtra: [
      { name: "workAuth", label: "Work authorization / right to work *", type: "select", required: true,
        options: ["Citizen", "Permanent resident", "Work visa / permit", "Other legal status"] },
      { name: "taxId", label: "Tax ID / National number (if applicable)", type: "text", required: false,
        placeholder: "Optional unless required in your country" }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work authorization required", type: "select", required: false,
        options: ["Any", "Citizen only", "Citizen or permanent resident", "Valid work visa accepted"] },
      { name: "mustHaveLocalId", label: "Must have government ID from this country", type: "select", required: false,
        options: ["No preference", "Yes – local national ID preferred", "Yes – mandatory"] }
    ],
    addressHint: "City and region / state",
    phoneHint: "Include country code, e.g. +1 …"
  },
  NG: {
    idTypes: ["National Identification Number (NIN)", "International Passport", "Driver's Licence", "Voter's Card (PVC)", "National ID Card"],
    idLabel: "NIN / ID Number",
    idPlaceholder: "11-digit NIN or passport number",
    employeeExtra: [
      { name: "nin", label: "NIN (National Identification Number) *", type: "text", required: true, placeholder: "11 digits" },
      { name: "stateOfOrigin", label: "State of origin *", type: "text", required: true, placeholder: "e.g. Lagos, Kano" },
      { name: "lga", label: "LGA (Local Government Area)", type: "text", required: false, placeholder: "Optional" },
      { name: "workAuth", label: "Right to work in Nigeria *", type: "select", required: true,
        options: ["Nigerian citizen", "CERPAC / residence permit", "Expatriate quota / work permit", "Other"] },
      { name: "taxId", label: "TIN (Tax Identification Number)", type: "text", required: false, placeholder: "Optional" }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work authorization *", type: "select", required: true,
        options: ["Any legal status", "Nigerian citizen only", "Citizen or valid work permit"] },
      { name: "mustHaveLocalId", label: "NIN / local ID required", type: "select", required: false,
        options: ["No preference", "NIN preferred", "NIN mandatory"] },
      { name: "preferredState", label: "Preferred state(s)", type: "text", required: false, placeholder: "e.g. Lagos, Abuja" }
    ],
    addressHint: "State and city (e.g. Lagos, Ikeja)",
    phoneHint: "Include +234"
  },
  US: {
    idTypes: ["Social Security Number (SSN)", "US Passport", "Driver's License / State ID", "Permanent Resident Card (Green Card)", "Employment Authorization Document (EAD)"],
    idLabel: "SSN / ID Number",
    idPlaceholder: "SSN or document number",
    employeeExtra: [
      { name: "ssnLast4", label: "SSN last 4 digits *", type: "text", required: true, placeholder: "XXXX" },
      { name: "workAuth", label: "Work authorization (US) *", type: "select", required: true,
        options: ["US citizen", "Permanent resident (Green Card)", "Work visa (H-1B, L-1, etc.)", "EAD / other authorized", "Need sponsorship"] },
      { name: "state", label: "State *", type: "text", required: true, placeholder: "e.g. California" },
      { name: "zip", label: "ZIP code *", type: "text", required: true, placeholder: "12345" }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work authorization required *", type: "select", required: true,
        options: ["Any authorized to work", "US citizen only", "Citizen or Green Card", "Will sponsor visa"] },
      { name: "mustHaveLocalId", label: "Background / ID check level", type: "select", required: false,
        options: ["Standard", "Enhanced / fingerprint", "No preference"] },
      { name: "preferredState", label: "Preferred state(s)", type: "text", required: false, placeholder: "e.g. TX, NY, CA" }
    ],
    addressHint: "City, State, ZIP",
    phoneHint: "Include +1"
  },
  GB: {
    idTypes: ["National Insurance Number", "UK Passport", "Driving Licence", "Biometric Residence Permit (BRP)", "Share Code / Right to Work"],
    idLabel: "NI number / ID",
    idPlaceholder: "QQ123456C or passport number",
    employeeExtra: [
      { name: "niNumber", label: "National Insurance number *", type: "text", required: true, placeholder: "QQ 12 34 56 C" },
      { name: "workAuth", label: "Right to work in the UK *", type: "select", required: true,
        options: ["British / Irish citizen", "Settled / pre-settled status", "Skilled Worker or other visa", "Other leave to remain"] },
      { name: "postcode", label: "Postcode *", type: "text", required: true, placeholder: "e.g. SW1A 1AA" }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Right to work required *", type: "select", required: true,
        options: ["Any with right to work", "British / Irish citizen", "Will sponsor Skilled Worker"] },
      { name: "mustHaveLocalId", label: "Share code / RTW check", type: "select", required: false,
        options: ["Required before start", "Preferred", "No preference"] }
    ],
    addressHint: "Town/city and postcode",
    phoneHint: "Include +44"
  },
  CA: {
    idTypes: ["Social Insurance Number (SIN)", "Canadian Passport", "Provincial ID / Driver's Licence", "PR Card", "Work Permit"],
    idLabel: "SIN / ID Number",
    idPlaceholder: "SIN or document number",
    employeeExtra: [
      { name: "sinLast3", label: "SIN last 3 digits *", type: "text", required: true, placeholder: "XXX" },
      { name: "workAuth", label: "Work authorization (Canada) *", type: "select", required: true,
        options: ["Canadian citizen", "Permanent resident", "Work permit holder", "Need LMIA / sponsorship"] },
      { name: "province", label: "Province / Territory *", type: "text", required: true, placeholder: "e.g. Ontario" }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work authorization *", type: "select", required: true,
        options: ["Any authorized", "Citizen or PR", "Open to work permit / LMIA"] },
      { name: "preferredState", label: "Preferred province(s)", type: "text", required: false, placeholder: "e.g. ON, BC" }
    ],
    addressHint: "City and province",
    phoneHint: "Include +1"
  },
  IN: {
    idTypes: ["Aadhaar", "PAN Card", "Indian Passport", "Voter ID", "Driving Licence"],
    idLabel: "Aadhaar / PAN / ID",
    idPlaceholder: "Aadhaar or PAN",
    employeeExtra: [
      { name: "aadhaarLast4", label: "Aadhaar last 4 digits *", type: "text", required: true, placeholder: "XXXX" },
      { name: "pan", label: "PAN *", type: "text", required: true, placeholder: "ABCDE1234F" },
      { name: "workAuth", label: "Work eligibility *", type: "select", required: true,
        options: ["Indian citizen", "OCI / PIO", "Employment visa", "Other"] },
      { name: "state", label: "State *", type: "text", required: true, placeholder: "e.g. Maharashtra" }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Eligibility *", type: "select", required: true,
        options: ["Indian citizen", "Citizen or OCI", "Any with valid work rights"] },
      { name: "mustHaveLocalId", label: "ID documents", type: "select", required: false,
        options: ["Aadhaar + PAN preferred", "PAN mandatory", "No preference"] }
    ],
    addressHint: "City and state",
    phoneHint: "Include +91"
  },
  AE: {
    idTypes: ["Emirates ID", "UAE Passport", "Residence Visa", "Labour Card"],
    idLabel: "Emirates ID number",
    idPlaceholder: "784-XXXX-XXXXXXX-X",
    employeeExtra: [
      { name: "emiratesId", label: "Emirates ID *", type: "text", required: true, placeholder: "784-…" },
      { name: "workAuth", label: "Visa / status *", type: "select", required: true,
        options: ["UAE national", "Residence visa + labour card", "Visit visa (not working)", "Other GCC national"] },
      { name: "emirate", label: "Emirate *", type: "select", required: true,
        options: ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "UAQ", "RAK", "Fujairah"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Visa status required *", type: "select", required: true,
        options: ["Any transferable / new visa OK", "Already on residence visa", "UAE national preferred"] },
      { name: "preferredState", label: "Preferred emirate", type: "text", required: false, placeholder: "e.g. Dubai" }
    ],
    addressHint: "Emirate and city/area",
    phoneHint: "Include +971"
  },
  SA: {
    idTypes: ["National ID (Saudi)", "Iqama", "Passport", "Border Number"],
    idLabel: "National ID / Iqama",
    idPlaceholder: "ID or Iqama number",
    employeeExtra: [
      { name: "iqama", label: "Iqama / National ID *", type: "text", required: true, placeholder: "Number" },
      { name: "workAuth", label: "Status *", type: "select", required: true,
        options: ["Saudi national", "Iqama holder", "Need sponsorship (kafeel)", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Status required *", type: "select", required: true,
        options: ["Saudi national (Saudization)", "Iqama transferable", "New sponsorship OK"] }
    ],
    addressHint: "City / region",
    phoneHint: "Include +966"
  },
  ZA: {
    idTypes: ["Green Barcoded ID / Smart ID", "Passport", "Asylum / permit document"],
    idLabel: "SA ID number",
    idPlaceholder: "13-digit ID number",
    employeeExtra: [
      { name: "saId", label: "South African ID number *", type: "text", required: true, placeholder: "13 digits" },
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["SA citizen", "Permanent resident", "Critical skills / work visa", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["SA citizen preferred", "Citizen or PR", "Valid work visa accepted"] }
    ],
    addressHint: "City and province",
    phoneHint: "Include +27"
  },
  KE: {
    idTypes: ["National ID", "Passport", "Alien ID", "Huduma Namba"],
    idLabel: "National ID number",
    idPlaceholder: "National ID",
    employeeExtra: [
      { name: "nationalId", label: "National ID *", type: "text", required: true, placeholder: "ID number" },
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["Kenyan citizen", "Work permit holder", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Kenyan citizen", "Citizen or work permit", "Any"] }
    ],
    addressHint: "County and town",
    phoneHint: "Include +254"
  },
  GH: {
    idTypes: ["Ghana Card", "Passport", "Voter ID", "SSNIT"],
    idLabel: "Ghana Card / ID",
    idPlaceholder: "GHA-XXXXXXXXX-X",
    employeeExtra: [
      { name: "ghanaCard", label: "Ghana Card number *", type: "text", required: true, placeholder: "GHA-…" },
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["Ghanaian citizen", "Residence / work permit", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Ghanaian citizen", "Citizen or permit", "Any"] }
    ],
    addressHint: "Region and city",
    phoneHint: "Include +233"
  },
  DE: {
    idTypes: ["Personalausweis", "Passport", "Aufenthaltstitel (residence title)", "EU ID"],
    idLabel: "ID / residence number",
    idPlaceholder: "Document number",
    employeeExtra: [
      { name: "workAuth", label: "Work authorization (Germany) *", type: "select", required: true,
        options: ["German / EU-EEA citizen", "Settlement permit", "EU Blue Card / work residence", "Need sponsorship"] },
      { name: "taxId", label: "Steuer-ID (tax ID)", type: "text", required: false, placeholder: "Optional" }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work authorization *", type: "select", required: true,
        options: ["EU/EEA citizen", "Valid German work residence", "Will sponsor"] }
    ],
    addressHint: "City and PLZ",
    phoneHint: "Include +49"
  },
  FR: {
    idTypes: ["Carte nationale d'identité", "Passport", "Titre de séjour", "EU ID"],
    idLabel: "ID / titre number",
    idPlaceholder: "Document number",
    employeeExtra: [
      { name: "workAuth", label: "Work authorization (France) *", type: "select", required: true,
        options: ["French / EU citizen", "Carte de séjour with work rights", "Need authorization"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work authorization *", type: "select", required: true,
        options: ["EU citizen", "Valid work rights", "Will sponsor"] }
    ],
    addressHint: "City and postcode",
    phoneHint: "Include +33"
  },
  AU: {
    idTypes: ["Driver's Licence", "Passport", "Medicare card", "ImmiCard"],
    idLabel: "ID number",
    idPlaceholder: "Licence or passport number",
    employeeExtra: [
      { name: "workAuth", label: "Work rights (Australia) *", type: "select", required: true,
        options: ["Australian citizen", "Permanent resident", "Temporary skill visa", "Need sponsorship"] },
      { name: "state", label: "State / Territory *", type: "text", required: true, placeholder: "e.g. NSW" }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work rights *", type: "select", required: true,
        options: ["Citizen or PR", "Valid work visa", "Will sponsor"] }
    ],
    addressHint: "City and state",
    phoneHint: "Include +61"
  },
  PH: {
    idTypes: ["PhilSys National ID", "Passport", "Driver's License", "UMID", "SSS"],
    idLabel: "PhilSys / ID number",
    idPlaceholder: "National ID or SSS",
    employeeExtra: [
      { name: "nationalId", label: "PhilSys / government ID *", type: "text", required: true, placeholder: "ID number" },
      { name: "workAuth", label: "Work eligibility *", type: "select", required: true,
        options: ["Filipino citizen", "Work visa / alien permit", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Eligibility *", type: "select", required: true,
        options: ["Filipino citizen", "Any with legal work rights"] }
    ],
    addressHint: "City / province",
    phoneHint: "Include +63"
  },
  BR: {
    idTypes: ["CPF", "RG", "Passport", "CNH"],
    idLabel: "CPF",
    idPlaceholder: "000.000.000-00",
    employeeExtra: [
      { name: "cpf", label: "CPF *", type: "text", required: true, placeholder: "000.000.000-00" },
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["Brazilian citizen", "Permanent resident", "Work visa", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Brazilian citizen", "Citizen or legal resident", "Any"] }
    ],
    addressHint: "City and state",
    phoneHint: "Include +55"
  },
  CN: {
    idTypes: ["Resident Identity Card", "Passport", "Foreign permanent resident ID"],
    idLabel: "ID number",
    idPlaceholder: "18-digit ID or passport",
    employeeExtra: [
      { name: "nationalId", label: "National ID / passport *", type: "text", required: true, placeholder: "ID number" },
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["Chinese citizen", "Work permit / residence", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Chinese citizen", "Valid work permit", "Any"] }
    ],
    addressHint: "Province and city",
    phoneHint: "Include +86"
  },
  JP: {
    idTypes: ["My Number Card", "Residence Card", "Passport", "Driver's License"],
    idLabel: "Residence / ID number",
    idPlaceholder: "Card number",
    employeeExtra: [
      { name: "workAuth", label: "Work status (Japan) *", type: "select", required: true,
        options: ["Japanese national", "Permanent resident", "Work-eligible residence status", "Need sponsorship"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Japanese national", "PR or work status", "Will sponsor"] }
    ],
    addressHint: "Prefecture and city",
    phoneHint: "Include +81"
  },
  SG: {
    idTypes: ["NRIC", "FIN", "Passport"],
    idLabel: "NRIC / FIN",
    idPlaceholder: "S/T/F/G number",
    employeeExtra: [
      { name: "nric", label: "NRIC / FIN *", type: "text", required: true, placeholder: "S1234567A" },
      { name: "workAuth", label: "Pass type *", type: "select", required: true,
        options: ["Singapore citizen", "PR", "Employment Pass / S Pass / WP", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Pass requirement *", type: "select", required: true,
        options: ["Citizen or PR", "EP/S Pass OK", "Any legal"] }
    ],
    addressHint: "District / area",
    phoneHint: "Include +65"
  },
  PK: {
    idTypes: ["CNIC", "Passport", "POC"],
    idLabel: "CNIC number",
    idPlaceholder: "XXXXX-XXXXXXX-X",
    employeeExtra: [
      { name: "cnic", label: "CNIC *", type: "text", required: true, placeholder: "XXXXX-XXXXXXX-X" },
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["Pakistani citizen", "Work visa", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Pakistani citizen", "Any legal"] }
    ],
    addressHint: "City and province",
    phoneHint: "Include +92"
  },
  BD: {
    idTypes: ["National ID", "Passport", "Birth registration"],
    idLabel: "NID number",
    idPlaceholder: "National ID",
    employeeExtra: [
      { name: "nationalId", label: "National ID *", type: "text", required: true, placeholder: "NID number" },
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["Bangladeshi citizen", "Work permit", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Bangladeshi citizen", "Any legal"] }
    ],
    addressHint: "District and city",
    phoneHint: "Include +880"
  },
  ID: {
    idTypes: ["KTP", "Passport", "KITAS"],
    idLabel: "NIK / KTP",
    idPlaceholder: "16-digit NIK",
    employeeExtra: [
      { name: "nik", label: "NIK (KTP) *", type: "text", required: true, placeholder: "16 digits" },
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["Indonesian citizen", "KITAS / work permit", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Indonesian citizen", "Valid permit", "Any"] }
    ],
    addressHint: "Province and city",
    phoneHint: "Include +62"
  },
  EG: {
    idTypes: ["National ID", "Passport"],
    idLabel: "National ID",
    idPlaceholder: "14-digit national ID",
    employeeExtra: [
      { name: "nationalId", label: "National ID *", type: "text", required: true, placeholder: "14 digits" },
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["Egyptian citizen", "Work permit", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Egyptian citizen", "Any legal"] }
    ],
    addressHint: "Governorate and city",
    phoneHint: "Include +20"
  },
  MX: {
    idTypes: ["CURP", "INE / Voter ID", "Passport", "RFC"],
    idLabel: "CURP / ID",
    idPlaceholder: "CURP",
    employeeExtra: [
      { name: "curp", label: "CURP *", type: "text", required: true, placeholder: "CURP" },
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["Mexican citizen", "Temporary / permanent resident", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Mexican citizen", "Legal resident", "Any"] }
    ],
    addressHint: "State and city",
    phoneHint: "Include +52"
  },
  KR: {
    idTypes: ["Resident Registration Number", "Alien Registration Card", "Passport"],
    idLabel: "RRN / ARC number",
    idPlaceholder: "ID number",
    employeeExtra: [
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["Korean national", "F-series residence", "E-series work visa", "Need sponsorship"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Korean national", "Valid work status", "Will sponsor"] }
    ],
    addressHint: "City / district",
    phoneHint: "Include +82"
  },
  TR: {
    idTypes: ["TC Kimlik No", "Passport", "Residence permit"],
    idLabel: "TC Kimlik No",
    idPlaceholder: "11-digit ID",
    employeeExtra: [
      { name: "tcKimlik", label: "TC Kimlik No *", type: "text", required: true, placeholder: "11 digits" },
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["Turkish citizen", "Work permit", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Turkish citizen", "Valid work permit", "Any"] }
    ],
    addressHint: "City",
    phoneHint: "Include +90"
  },
  IT: {
    idTypes: ["Carta d'identità", "Passport", "Permesso di soggiorno", "Codice fiscale"],
    idLabel: "ID / codice fiscale",
    idPlaceholder: "Document or tax code",
    employeeExtra: [
      { name: "codiceFiscale", label: "Codice fiscale *", type: "text", required: true, placeholder: "Tax code" },
      { name: "workAuth", label: "Work authorization *", type: "select", required: true,
        options: ["Italian / EU citizen", "Permesso with work rights", "Need sponsorship"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work authorization *", type: "select", required: true,
        options: ["EU citizen", "Valid work rights", "Will sponsor"] }
    ],
    addressHint: "City and CAP",
    phoneHint: "Include +39"
  },
  NL: {
    idTypes: ["Passport", "ID card", "Residence permit", "BSN"],
    idLabel: "BSN / ID",
    idPlaceholder: "BSN or document number",
    employeeExtra: [
      { name: "bsn", label: "BSN *", type: "text", required: true, placeholder: "Citizen service number" },
      { name: "workAuth", label: "Work authorization *", type: "select", required: true,
        options: ["Dutch / EU citizen", "Residence with work rights", "Need sponsorship"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work authorization *", type: "select", required: true,
        options: ["EU citizen", "Valid work rights", "Will sponsor"] }
    ],
    addressHint: "City and postcode",
    phoneHint: "Include +31"
  },
  PL: {
    idTypes: ["PESEL", "Passport", "ID card", "Residence card"],
    idLabel: "PESEL / ID",
    idPlaceholder: "PESEL number",
    employeeExtra: [
      { name: "pesel", label: "PESEL *", type: "text", required: true, placeholder: "11 digits" },
      { name: "workAuth", label: "Work authorization *", type: "select", required: true,
        options: ["Polish / EU citizen", "Work permit / residence", "Need sponsorship"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work authorization *", type: "select", required: true,
        options: ["EU citizen", "Valid work rights", "Will sponsor"] }
    ],
    addressHint: "City",
    phoneHint: "Include +48"
  },
  ES: {
    idTypes: ["DNI", "NIE", "Passport", "EU ID"],
    idLabel: "DNI / NIE",
    idPlaceholder: "DNI or NIE",
    employeeExtra: [
      { name: "dniNie", label: "DNI / NIE *", type: "text", required: true, placeholder: "ID number" },
      { name: "workAuth", label: "Work authorization *", type: "select", required: true,
        options: ["Spanish / EU citizen", "Residence with work rights", "Need sponsorship"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work authorization *", type: "select", required: true,
        options: ["EU citizen", "Valid work rights", "Will sponsor"] }
    ],
    addressHint: "City and province",
    phoneHint: "Include +34"
  },
  RU: {
    idTypes: ["Internal passport", "International passport", "Migration card"],
    idLabel: "Passport number",
    idPlaceholder: "Document number",
    employeeExtra: [
      { name: "workAuth", label: "Work status *", type: "select", required: true,
        options: ["Russian citizen", "Work patent / permit", "Other"] }
    ],
    employerExtra: [
      { name: "workAuthRequired", label: "Work status *", type: "select", required: true,
        options: ["Russian citizen", "Valid work permit", "Any"] }
    ],
    addressHint: "City / region",
    phoneHint: "Include +7"
  }
};

function getCountryCodeFromName(name) {
  if (!name) return "";
  const c = (typeof COUNTRIES !== "undefined" ? COUNTRIES : []).find(
    x => x.name === name || x.code === name || x.name.toLowerCase() === String(name).toLowerCase()
  );
  return c ? c.code : "";
}

function getCountryNameFromCode(code) {
  if (!code) return "";
  const c = (typeof COUNTRIES !== "undefined" ? COUNTRIES : []).find(
    x => x.code === code || x.name === code
  );
  return c ? c.name : code;
}

/** Resolve form rules by ISO 3166-1 alpha-2 or country name */
function getCountryFormRules(countryOrCode) {
  if (!countryOrCode) return COUNTRY_FORM_RULES.default;
  const raw = String(countryOrCode).trim();
  // Direct alpha-2 key
  if (COUNTRY_FORM_RULES[raw]) return COUNTRY_FORM_RULES[raw];
  const upper = raw.toUpperCase();
  if (COUNTRY_FORM_RULES[upper]) return COUNTRY_FORM_RULES[upper];
  // Name → code
  const code = getCountryCodeFromName(raw);
  if (code && COUNTRY_FORM_RULES[code]) return COUNTRY_FORM_RULES[code];
  return COUNTRY_FORM_RULES.default;
}

