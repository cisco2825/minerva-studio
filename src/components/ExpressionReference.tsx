import { useEffect } from 'react';

// ── Section → node-type mapping (used by PolicyEditor to smart-scroll) ────────
export const NODE_TYPE_TO_SECTION: Record<string, string> = {
  RULE:          'operators',
  BRANCH:        'conditionals',
  CUSTOM_OUTPUT: 'custom-output',
  OUTCOME:       'functions',
  MODEL:         'functions',
  SOURCE:        'lookups',
  WORKFLOW:      'workflow-results',
  START:         'overview',
};

// ── Section manifest (drives TOC + rendering) ─────────────────────────────────
export interface Section {
  id: string;
  num: string;
  title: string;
  blocks: Block[];
}

type Block =
  | { t: 'text';    s: string }
  | { t: 'sub';     s: string }
  | { t: 'code';    lines: string[] }
  | { t: 'callout'; kind: 'info' | 'warning' | 'tip'; title: string; lines: string[] }
  | { t: 'table';   headers: string[]; rows: string[][]; codeCols?: number[] }
  | { t: 'bullets'; items: string[] }
  | { t: 'syntax';  label: string; code: string };

// ── Content ───────────────────────────────────────────────────────────────────
export const SECTIONS: Section[] = [
  {
    id: 'overview', num: '01', title: 'Overview',
    blocks: [
      { t: 'text', s: 'Expressions are short, readable formulas written directly in the policy editor. They power every decision point — rule conditions, branch routing, scorecard bands, output values, and custom output templates.' },
      { t: 'text', s: 'The language is SQL-like in style, strongly typed at runtime, and requires no programming background. Every expression produces a single typed value:' },
      { t: 'table',
        headers: ['Type', 'Example', 'Notes'],
        rows: [
          ['Number',  "750,  3.14,  -50",           'All numbers are floating point'],
          ['Text',    "'approved',  '2024-01-15'",   'Single-quoted strings'],
          ['Boolean', 'true,  false',                'Case-insensitive: TRUE, True all work'],
          ['Date',    "'2024-06-15'",               'yyyy-MM-dd text, parsed by date functions'],
          ['List',    "['SAL', 'SEL'],  [600, 750]", 'Inline lists, used with IN operator'],
          ['Null',    'null',                        'Absent or unknown value'],
        ],
        codeCols: [0, 1],
      },
      { t: 'callout', kind: 'info', title: 'INFO',
        lines: [
          'Expressions are validated before saving — you cannot save a policy with invalid expressions.',
          'A missing context field fails at runtime. Use ISNULL() to guard optional fields.',
        ],
      },
    ],
  },
  {
    id: 'context-paths', num: '02', title: 'Accessing Your Data',
    blocks: [
      { t: 'text', s: 'Your policy receives a context — a JSON object with the data for the current request. Reference fields by name, and use dot notation to navigate nested objects.' },
      { t: 'code', lines: [
        '// Top-level fields',
        'applicant.age',
        'bureau.credit_score',
        'loan.requested_amount',
        '',
        '// Nested objects',
        'applicant.employment.employer_name',
        'bureau.history.worst_dpd_12m',
      ]},
    ],
  },
  {
    id: 'operators', num: '03', title: 'Operators',
    blocks: [
      { t: 'sub', s: 'Comparison' },
      { t: 'table',
        headers: ['Operator', 'Meaning', 'Example'],
        rows: [
          ['= or ==',  'Equal',                  "applicant.status = 'ACTIVE'"],
          ['!= or <>', 'Not equal',              "applicant.status != 'BLACKLISTED'"],
          ['>',        'Greater than',           'applicant.age > 21'],
          ['>=',       'Greater than or equal',  'bureau.credit_score >= 700'],
          ['<',        'Less than',              'applicant.foir < 0.5'],
          ['<=',       'Less than or equal',     'bureau.dpd <= 0'],
        ],
        codeCols: [0, 2],
      },
      { t: 'sub', s: 'Logical — AND · OR · NOT' },
      { t: 'callout', kind: 'warning', title: 'NOTE',
        lines: ['Use AND / OR / NOT as keywords. The symbols &&, ||, and ! are not supported.'],
      },
      { t: 'table',
        headers: ['Operator', 'Meaning', 'Example'],
        rows: [
          ['AND', 'Both must be true',   'age >= 21 AND bureau.credit_score >= 700'],
          ['OR',  'Either must be true', "type = 'SALARIED' OR type = 'SELF_EMPLOYED'"],
          ['NOT', 'Negates condition',   'NOT applicant.city IN LOOKUP("blocked_cities", "city")'],
        ],
        codeCols: [0, 2],
      },
      { t: 'sub', s: 'Arithmetic' },
      { t: 'table',
        headers: ['Op', 'Meaning', 'Example'],
        rows: [
          ['+', 'Add (also concatenates text)', 'income + co_income'],
          ['-', 'Subtract',                      'loan.amount - down_payment'],
          ['*', 'Multiply',                      'applicant.income * 0.6'],
          ['/', 'Divide (throws on zero)',        'loan.emi / applicant.income'],
          ['%', 'Modulo',                        'loan.amount % 100'],
        ],
        codeCols: [0, 2],
      },
      { t: 'sub', s: 'Range — BETWEEN' },
      { t: 'code', lines: [
        'bureau.credit_score BETWEEN 650 AND 750',
        'applicant.age       NOT BETWEEN 18 AND 25',
      ]},
      { t: 'sub', s: 'Membership — IN / NOT IN' },
      { t: 'code', lines: [
        "// Inline list",
        "applicant.employment_type IN ['SALARIED', 'SELF_EMPLOYED']",
        '',
        "// Lookup table — LOOKUP(\"name\", \"column\")",
        'applicant.city NOT IN LOOKUP("blocked_cities", "city")',
      ]},
      { t: 'sub', s: 'Null Checks — IS NULL / IS NOT NULL' },
      { t: 'code', lines: [
        'applicant.co_applicant IS NULL',
        'bureau.credit_score   IS NOT NULL',
      ]},
      { t: 'callout', kind: 'tip', title: 'TIP',
        lines: ['Prefer ISNULL() over IS NULL for optional fields — it will not throw if the field is entirely absent from the context.'],
      },
      { t: 'sub', s: 'String Operations' },
      { t: 'table',
        headers: ['Operator', 'Description', 'Example'],
        rows: [
          ['CONTAINS',    'Text contains substring',          "employer CONTAINS 'Bank'"],
          ['STARTS_WITH', 'Text begins with value',          "pan STARTS_WITH 'A'"],
          ['ENDS_WITH',   'Text ends with value',            "email ENDS_WITH '.com'"],
          ['MATCHES',     'Text matches Java regex',         "pan MATCHES '[A-Z]{5}[0-9]{4}[A-Z]'"],
        ],
        codeCols: [0, 2],
      },
    ],
  },
  {
    id: 'conditionals', num: '04', title: 'Conditional Logic',
    blocks: [
      { t: 'sub', s: 'Ternary  ( condition ? thenValue : elseValue )' },
      { t: 'code', lines: ["applicant.age >= 21 ? 'ELIGIBLE' : 'NOT_ELIGIBLE'"] },
      { t: 'sub', s: 'IFELSE() Function' },
      { t: 'text', s: 'Identical to the ternary but reads better in complex expressions. Only the matching branch is evaluated — the other is skipped entirely.' },
      { t: 'code', lines: [
        "IFELSE(bureau.credit_score >= 700, 'APPROVED', 'REJECTED')",
        '',
        '// Nested',
        'IFELSE(',
        '  bureau.credit_score >= 750,',
        "  'PREMIUM',",
        "  IFELSE(bureau.credit_score >= 650, 'STANDARD', 'DECLINED')",
        ')',
      ]},
    ],
  },
  {
    id: 'functions', num: '05', title: 'Built-in Functions',
    blocks: [
      { t: 'sub', s: 'Math' },
      { t: 'table',
        headers: ['Function', 'Signature', 'Description'],
        rows: [
          ['ABS',   'ABS(n)',              'Absolute value'],
          ['ROUND', 'ROUND(n, decimals?)', 'Round to given decimal places (default 0)'],
          ['FLOOR', 'FLOOR(n)',            'Round down to nearest integer'],
          ['CEIL',  'CEIL(n)',             'Round up to nearest integer'],
          ['MIN',   'MIN(a, b, ...)',       'Minimum of one or more values'],
          ['MAX',   'MAX(a, b, ...)',       'Maximum of one or more values'],
          ['POW',   'POW(base, exp)',       'base raised to the power exp'],
          ['SQRT',  'SQRT(n)',             'Square root'],
        ],
        codeCols: [0, 1],
      },
      { t: 'code', lines: [
        'ROUND(applicant.foir * 100, 2)',
        'MIN(bureau.credit_score, 850)',
      ]},
      { t: 'sub', s: 'String' },
      { t: 'table',
        headers: ['Function', 'Signature', 'Description'],
        rows: [
          ['UPPER',   'UPPER(s)',                'Convert to uppercase'],
          ['LOWER',   'LOWER(s)',                'Convert to lowercase'],
          ['TRIM',    'TRIM(s)',                 'Remove leading / trailing whitespace'],
          ['LENGTH',  'LENGTH(s)',               'Number of characters'],
          ['CONCAT',  'CONCAT(a, b, ...)',        'Join multiple values into a string'],
          ['SUBSTR',  'SUBSTR(s, start, len?)',   'Extract substring (0-based)'],
          ['REPLACE', 'REPLACE(s, find, with)',  'Replace all occurrences'],
          ['SPLIT',   'SPLIT(s, delimiter)',      'Split text into a list'],
          ['JOIN',    'JOIN(list, delimiter)',     'Join a list into a string'],
        ],
        codeCols: [0, 1],
      },
      { t: 'sub', s: 'Date' },
      { t: 'callout', kind: 'info', title: 'INFO',
        lines: ["Dates are strings in yyyy-MM-dd format, e.g. '2024-06-15'. All date functions parse this automatically."],
      },
      { t: 'table',
        headers: ['Function', 'Signature', 'Description'],
        rows: [
          ['TODAY',    'TODAY()',                  "Returns today's date as yyyy-MM-dd"],
          ['DATE',     'DATE(s)',                  'Parses and validates a date string'],
          ['DATEDIFF', 'DATEDIFF(d1, d2, unit?)', "Difference: unit 'DAYS' (default), 'MONTHS', 'YEARS'"],
          ['DATEADD',  'DATEADD(d, n, unit)',      "Add DAYS, MONTHS, or YEARS to a date"],
          ['AGE',      'AGE(dob)',                 'Full years from date-of-birth to today'],
          ['YEAR',     'YEAR(d)',                  'Extract four-digit year'],
          ['MONTH',    'MONTH(d)',                 'Extract month (1–12)'],
          ['DAY',      'DAY(d)',                   'Extract day of month (1–31)'],
        ],
        codeCols: [0, 1],
      },
      { t: 'code', lines: [
        'AGE(applicant.date_of_birth) >= 21',
        "DATEDIFF(TODAY(), applicant.last_loan_date, 'MONTHS') >= 12",
      ]},
      { t: 'sub', s: 'Logic & Null Handling' },
      { t: 'table',
        headers: ['Function', 'Signature', 'Description'],
        rows: [
          ['IFELSE',   'IFELSE(cond, then, else)', 'Conditional — lazy, evaluates only the matching branch'],
          ['IF',       'IF(cond, then, else)',      'Conditional — eager, evaluates all arguments'],
          ['COALESCE', 'COALESCE(a, b, ...)',       'Returns the first non-null value'],
          ['NULLIF',   'NULLIF(a, b)',              'Returns null if a equals b, otherwise a'],
        ],
        codeCols: [0, 1],
      },
      { t: 'sub', s: 'Type Checking & Conversion' },
      { t: 'table',
        headers: ['Function', 'Signature', 'Description'],
        rows: [
          ['ISNULL',    'ISNULL(expr)',    'true if null or field is absent — safe on missing fields'],
          ['ISNUMBER',  'ISNUMBER(expr)',  'true if the value is a number'],
          ['ISSTRING',  'ISSTRING(expr)',  'true if the value is a string'],
          ['TO_NUMBER', 'TO_NUMBER(expr)', "Converts a string to a number: TO_NUMBER('750') → 750"],
          ['TO_STRING', 'TO_STRING(expr)', 'Converts any value to its string representation'],
        ],
        codeCols: [0, 1],
      },
      { t: 'callout', kind: 'tip', title: 'TIP',
        lines: [
          'ISNULL() is the safest way to guard optional fields.',
          "Example: ISNULL(applicant.co_income) ? 0 : applicant.co_income",
        ],
      },
    ],
  },
  {
    id: 'lookups', num: '06', title: 'Lookup References — LOOKUP()',
    blocks: [
      { t: 'text', s: 'Lookup tables are CSV files managed in the Lookups section. Reference a lookup in any expression using the LOOKUP() function — it returns the full list of values in a given column, ready for IN / NOT IN checks.' },
      { t: 'syntax', label: 'SYNTAX',
        code: 'LOOKUP("lookupId", "columnName")',
      },
      { t: 'code', lines: [
        '// Check city against an approved list',
        'applicant.city     IN LOOKUP("cc_metro_cities", "city")',
        '',
        '// Reject blacklisted employers',
        'applicant.employer NOT IN LOOKUP("cc_blocked_employers", "employer_name")',
        '',
        '// PIN code eligibility',
        'applicant.pincode  IN LOOKUP("approved_pincodes", "pincode")',
      ]},
      { t: 'table',
        headers: ['Argument', 'Type', 'Description'],
        rows: [
          ['lookupId',    'String literal', 'The ID of the lookup as created in the Lookups section'],
          ['columnName',  'String literal', 'The CSV column header whose values to load'],
        ],
        codeCols: [0, 1],
      },
      { t: 'callout', kind: 'tip', title: 'TIP',
        lines: [
          'Start typing LOOKUP(" in any expression field and the editor will suggest available lookup IDs.',
          'After you pick a name, type , " and the editor will suggest the columns for that lookup.',
        ],
      },
      { t: 'bullets', items: [
        'Both arguments must be string literals — not variables or expressions.',
        'Lookup IDs use underscores, not hyphens:  cc_metro_cities  not  cc-metro-cities.',
        'The lookup must be in ACTIVE status for evaluation to succeed.',
        'LOOKUP() always returns a list — use it on the right-hand side of IN / NOT IN only.',
        'Inline lookups (non-CSV) ignore the column argument and return all values.',
      ]},
    ],
  },
  {
    id: 'let-blocks', num: '07', title: 'LET — Named Intermediate Values',
    blocks: [
      { t: 'text', s: 'Declare named intermediate variables to avoid repeating sub-expressions. The last expression after the final semicolon is the result.' },
      { t: 'syntax', label: 'SYNTAX',
        code: 'let <name> = <expr>;  <name> = <expr>;  <body>',
      },
      { t: 'code', lines: [
        '// FOIR check',
        'let foir = loan.emi / applicant.income;',
        '    foir <= 0.5 AND bureau.credit_score >= 700',
        '',
        '// Multiple bindings',
        'let base     = applicant.annual_income * 0.4;',
        '    adjusted = base - existing_obligations;',
        '    adjusted > loan.requested_emi',
      ]},
      { t: 'callout', kind: 'tip', title: 'TIP',
        lines: [
          'Bindings are evaluated in order — later ones can reference earlier ones.',
          'A let variable shadows a context field with the same name within that block.',
        ],
      },
    ],
  },
  {
    id: 'workflow-results', num: '08', title: 'Workflow & Sub-Policy Results',
    blocks: [
      { t: 'text', s: 'When a policy calls another policy via a Workflow node, the result is injected at a Result Key you define. Access its fields using dot notation.' },
      { t: 'code', lines: [
        "idfc_result.outcome",
        "idfc_result.credit_limit",
        '',
        "IFELSE(",
        "  idfc_result.outcome = 'APPROVED' AND hdfc_result.outcome = 'APPROVED',",
        "  'ELIGIBLE_ALL_BANKS',",
        "  'PARTIALLY_ELIGIBLE'",
        ")",
      ]},
      { t: 'callout', kind: 'warning', title: 'NOTE',
        lines: [
          'Use AND / OR keywords — not && / || — even inside multi-bank IFELSE expressions.',
          'If a Workflow node has not yet executed, its result key will be absent. Guard with ISNULL().',
        ],
      },
    ],
  },
  {
    id: 'custom-output', num: '09', title: 'Custom Output Templates',
    blocks: [
      { t: 'text', s: 'The Custom Output node produces a structured JSON object or array. Double-quoted values are literals; unquoted values are evaluated as full expressions.' },
      { t: 'table',
        headers: ['Element', 'Treatment'],
        rows: [
          ['Double-quoted keys',        'Must be strings — required for every object key'],
          ['Double-quoted values',      'Literal strings — rendered as-is'],
          ['Unquoted values',           'Full expressions — IFELSE, AND/OR, functions, context paths'],
          ['Numbers / booleans / null', 'Unquoted literals treated as their native types'],
        ],
      },
      { t: 'code', lines: [
        '[',
        '  {',
        '    "bank": "IDFC",',
        "    \"decision\": IFELSE(idfc_result.outcome == 'APPROVED', \"approved\", \"rejected\"),",
        '    "credit_limit": idfc_result.credit_limit',
        '  }',
        ']',
      ]},
      { t: 'callout', kind: 'warning', title: 'NOTE',
        lines: ['Use AND / OR inside unquoted expression values — not && / ||.'],
      },
    ],
  },
  {
    id: 'quick-reference', num: '10', title: 'Quick Reference',
    blocks: [
      { t: 'code', lines: [
        '// ── Context ──────────────────────────────────────',
        'applicant.age             bureau.credit_score',
        '',
        '// ── Comparisons ──────────────────────────────────',
        "score >= 700              status = 'APPROVED'",
        '',
        '// ── Range ────────────────────────────────────────',
        'score BETWEEN 650 AND 750',
        '',
        '// ── Membership ───────────────────────────────────',
        "city IN ['MUMBAI', 'DELHI']",
        'employer NOT IN LOOKUP("blocked_employers", "employer_name")',
        '',
        '// ── Logic ────────────────────────────────────────',
        'age >= 21 AND score >= 700',
        'NOT applicant.is_blacklisted',
        '',
        '// ── Null guard ───────────────────────────────────',
        'ISNULL(bureau.score)      field IS NULL',
        '',
        '// ── Conditional ──────────────────────────────────',
        "IFELSE(score >= 700, 'APPROVED', 'REJECTED')",
        "score >= 750 ? 'PREMIUM' : 'STANDARD'",
        '',
        '// ── Date ─────────────────────────────────────────',
        'AGE(date_of_birth) >= 21',
        "DATEDIFF(TODAY(), last_loan_date, 'MONTHS') >= 12",
        '',
        '// ── LET block ────────────────────────────────────',
        'let foir = emi / income;',
        '    foir <= 0.5 AND score >= 700',
        '',
        '// ── Lookup ───────────────────────────────────────',
        'pincode IN LOOKUP("approved_pincodes", "pincode")',
        '',
        '// ── Workflow result ──────────────────────────────',
        "idfc_result.outcome = 'APPROVED'",
      ]},
    ],
  },
  {
    id: 'key-rules', num: '11', title: 'Key Rules',
    blocks: [
      { t: 'bullets', items: [
        'AND / OR / NOT — not &&, ||, !',
        "Single-quoted strings: 'APPROVED', '2024-01-01'",
        'Dates are strings in yyyy-MM-dd format',
        'Lookup syntax:  field IN LOOKUP("cc_metro_cities", "city")',
        'Guard optional fields with ISNULL() before accessing them',
        'Guard against divide-by-zero: IFELSE(denom != 0, n / denom, 0)',
        'All keywords and function names are case-insensitive',
        'Custom Output templates: use AND / OR, not && / ||',
      ]},
    ],
  },
];

// ── Design tokens (matching Minerva palette) ──────────────────────────────────
const T = {
  indigo:      '#6366f1',
  indigoDeep:  '#4f46e5',
  indigoLight: '#eef2ff',
  indigoPale:  '#e0e7ff',
  darkMid:     '#1e293b',
  bodyText:    '#1e293b',
  headText:    '#0f172a',
  muted:       '#64748b',
  border:      '#e2e8f0',
  altRow:      '#f8faff',
  codeText:    '#e2e8f0',
  codeComment: '#64748b',
  warnBg:      '#fff7ed',
  warnBorder:  '#fb923c',
  warnText:    '#9a3412',
  tipBg:       '#f0fdf4',
  tipBorder:   '#22c55e',
  tipText:     '#14532d',
};

// ── Block renderers ───────────────────────────────────────────────────────────

function CodeBlock({ lines }: { lines: string[] }) {
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
      {/* Gradient accent strip */}
      <div style={{
        height: 3,
        background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
      }} />
      <div style={{
        background: T.darkMid,
        padding: '14px 16px',
        fontFamily: 'monospace',
        fontSize: 12.5,
        lineHeight: '20px',
      }}>
        {lines.map((line, i) => {
          const trimmed = line.trimStart();
          const isComment = trimmed.startsWith('//') || trimmed.startsWith('#');
          return (
            <div key={i} style={{
              color: isComment ? T.codeComment : T.codeText,
              minHeight: line === '' ? 8 : undefined,
              whiteSpace: 'pre',
            }}>
              {line || '​'}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Callout({ kind, title, lines }: { kind: 'info' | 'warning' | 'tip'; title: string; lines: string[] }) {
  const cfg = {
    info:    { bg: T.indigoLight, bar: T.indigo,      text: T.indigoDeep,  label: T.indigo },
    warning: { bg: T.warnBg,      bar: T.warnBorder,  text: T.warnText,    label: T.warnBorder },
    tip:     { bg: T.tipBg,       bar: T.tipBorder,   text: T.tipText,     label: T.tipBorder },
  }[kind];

  return (
    <div style={{ display: 'flex', marginBottom: 16, borderRadius: 6, overflow: 'hidden', border: `1px solid ${cfg.bar}30` }}>
      <div style={{ width: 4, flexShrink: 0, background: cfg.bar }} />
      <div style={{ background: cfg.bg, padding: '10px 14px', flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: cfg.label, letterSpacing: '0.06em', marginBottom: 4 }}>
          {title}
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: 12.5, color: cfg.text, lineHeight: '18px', marginBottom: i < lines.length - 1 ? 4 : 0 }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

function RefTable({ headers, rows, codeCols = [] }: { headers: string[]; rows: string[][]; codeCols?: number[] }) {
  return (
    <div style={{ marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: T.indigoDeep }}>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '7px 10px', textAlign: 'left',
                color: '#fff', fontWeight: 700, fontSize: 11.5,
                letterSpacing: '0.02em',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : T.altRow }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '7px 10px',
                  color: ci === 0 ? T.indigoDeep : T.bodyText,
                  fontFamily: codeCols.includes(ci) ? 'monospace' : 'inherit',
                  fontSize: codeCols.includes(ci) ? 11.5 : 12.5,
                  fontWeight: ci === 0 ? 600 : 400,
                  borderBottom: `1px solid ${T.border}`,
                  lineHeight: '17px',
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SyntaxBox({ label, code }: { label: string; code: string }) {
  return (
    <div style={{
      border: `1px solid ${T.indigoPale}`,
      borderRadius: 8, background: T.indigoLight,
      padding: '10px 14px', marginBottom: 16,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.indigo, letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <code style={{ fontSize: 12.5, color: T.indigoDeep, fontFamily: 'monospace' }}>{code}</code>
    </div>
  );
}

function SectionBadge({ num }: { num: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 24, height: 24, borderRadius: 6,
      background: T.indigo, color: '#fff',
      fontSize: 10, fontWeight: 700, marginRight: 10, flexShrink: 0,
    }}>{num}</span>
  );
}

function renderBlock(block: Block, i: number) {
  switch (block.t) {
    case 'text':    return <p key={i} style={{ fontSize: 13, color: T.bodyText, lineHeight: '20px', marginBottom: 12 }}>{block.s}</p>;
    case 'sub':     return <h4 key={i} style={{ fontSize: 13, fontWeight: 700, color: T.headText, marginTop: 20, marginBottom: 8, paddingLeft: 10, borderLeft: `3px solid ${T.indigo}` }}>{block.s}</h4>;
    case 'code':    return <CodeBlock key={i} lines={block.lines} />;
    case 'callout': return <Callout key={i} kind={block.kind} title={block.title} lines={block.lines} />;
    case 'table':   return <RefTable key={i} headers={block.headers} rows={block.rows} codeCols={block.codeCols} />;
    case 'bullets': return (
      <ul key={i} style={{ paddingLeft: 18, marginBottom: 16 }}>
        {block.items.map((item, ii) => (
          <li key={ii} style={{ fontSize: 13, color: T.bodyText, lineHeight: '20px', marginBottom: 5 }}>
            <span style={{ color: T.indigo, fontWeight: 700, marginRight: 4 }}>·</span>{item}
          </li>
        ))}
      </ul>
    );
    case 'syntax':  return <SyntaxBox key={i} label={block.label} code={block.code} />;
    default:        return null;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

interface ExpressionReferenceProps {
  /** Section ID to scroll to on open (used by PolicyEditor smart-scroll). */
  targetSection?: string;
  /** Compact mode: slightly tighter spacing, used inside the editor drawer. */
  compact?: boolean;
}

export default function ExpressionReference({ targetSection, compact }: ExpressionReferenceProps) {
  // Scroll to targetSection after mount
  useEffect(() => {
    if (!targetSection) return;
    const el = document.getElementById(`ref-sec-${targetSection}`);
    if (el) {
      // Small delay to let the Drawer finish its open animation
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
  }, [targetSection]);

  return (
    <div style={{ paddingBottom: 40 }}>
      {SECTIONS.map(sec => (
        <div
          key={sec.id}
          id={`ref-sec-${sec.id}`}
          style={{ marginBottom: compact ? 28 : 40 }}
        >
          {/* Section header */}
          <div style={{
            display: 'flex', alignItems: 'center',
            paddingBottom: 8,
            borderBottom: `2px solid ${T.indigo}`,
            marginBottom: 16,
          }}>
            <SectionBadge num={sec.num} />
            <h3 style={{
              margin: 0,
              fontSize: compact ? 15 : 17,
              fontWeight: 700,
              color: T.headText,
            }}>
              {sec.title}
            </h3>
          </div>

          {/* Blocks */}
          {sec.blocks.map((block, i) => renderBlock(block, i))}
        </div>
      ))}
    </div>
  );
}
