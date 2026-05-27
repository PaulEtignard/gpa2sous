export interface Rule {
  id?: string;
  pattern: string;
  category_id: string;
  priority: number;
}

/**
 * Default keyword → category-name rules. Patterns are matched case-insensitively
 * as substrings against the transaction description (after diacritic stripping).
 *
 * Order matters when multiple keywords could match the same description:
 * the rule with the lower priority wins. Earlier groups here get lower numbers.
 */
export const DEFAULT_KEYWORD_RULES: { keywords: string[]; category: string }[] = [
  // ---- INCOME ----
  {
    keywords: [
      "vir la poste rh",
      "vir ep salariale",
      "vir salaire",
      "salaire",
      "salary",
      "paye ",
      "remuneration",
    ],
    category: "Salaire",
  },
  {
    keywords: [
      "vir caf",
      "vir cpam",
      "vir complementaire sante",
      "caf du",
      "cpam du",
      "allocation",
      "remboursement",
    ],
    category: "Autres revenus",
  },

  // ---- EXPENSE — alimentation ----
  {
    keywords: [
      "carrefour",
      "leclerc",
      "lidl",
      "auchan",
      "monoprix",
      "franprix",
      "casino",
      "intermarche",
      "super u",
      "g20",
      "naturalia",
      "biocoop",
      "picard",
      "netto",
      "aldi",
      "spar",
      "cora",
      "match ",
    ],
    category: "Alimentation",
  },

  // ---- Restaurants & bars ----
  {
    keywords: [
      "restaurant",
      "uber eats",
      "deliveroo",
      "just eat",
      "mcdo",
      "mc donald",
      "mc do ",
      "burger king",
      "burker king",
      "kfc",
      "subway",
      "starbucks",
      "boulangerie",
      "brasserie",
      "pizza",
      "sushi",
      "jow",
      "wok ",
      "calao",
      "my little italy",
      "aux ateliers",
      "fivel",
    ],
    category: "Restaurants & bars",
  },

  // ---- Transports ----
  {
    keywords: [
      "sncf",
      "ratp",
      "uber",
      "bolt",
      "lime",
      "blablacar",
      "essence",
      "total ",
      "shell",
      "esso",
      " bp ",
      "station",
      "parking",
      "autoroute",
      "vinci",
      "ouigo",
      "tgv",
      "navigo",
      "keolis",
      "certas",
      "laboiserie",
      "sp ",
    ],
    category: "Transports",
  },

  // ---- Logement (energy, rent, household services) ----
  {
    keywords: [
      "loyer",
      "edf",
      "engie",
      "veolia",
      "syndic",
      "copropriete",
      "assurance habitation",
    ],
    category: "Logement",
  },

  // ---- Factures & abos ----
  {
    keywords: [
      "orange",
      "free ",
      "sfr",
      "bouygues",
      "netflix",
      "spotify",
      "amazon prime",
      "disney",
      "youtube",
      "icloud",
      "google",
      "microsoft",
      "adobe",
      "openai",
      "anthropic",
      "claude.ai",
      "chatgpt",
      "abonnement fibre",
      "cotis euc",
    ],
    category: "Factures & abos",
  },

  // ---- Santé ----
  {
    keywords: [
      "pharmacie",
      "medecin",
      "docteur",
      "hopital",
      "mutuelle",
      "doctolib",
      "laboratoire",
      "dentiste",
      "mma iard",
      "mma ",
      "complementaire sante",
      "selarl",
    ],
    category: "Santé",
  },

  // ---- Shopping ----
  {
    keywords: [
      "amazon",
      "zalando",
      "fnac",
      "darty",
      "ikea",
      "decathlon",
      "zara",
      "h&m",
      "uniqlo",
      "asos",
      "shein",
      "veepee",
      "boulanger",
      "3x 4x oney",
      "oney",
    ],
    category: "Shopping",
  },

  // ---- Loisirs ----
  {
    keywords: [
      "cinema",
      "ugc",
      "pathe",
      "mk2",
      "concert",
      "spectacle",
      "musee",
      "fnac spectacles",
      "ticketmaster",
      "instant gaming",
      "steam",
      "playstation",
      "nintendo",
    ],
    category: "Loisirs",
  },

  // ---- Voyages ----
  {
    keywords: [
      "airbnb",
      "booking",
      "hotel",
      "ryanair",
      "easyjet",
      "air france",
      "transavia",
      "lufthansa",
      "vueling",
      "expedia",
    ],
    category: "Voyages",
  },

  // ---- Retraits ----
  {
    keywords: ["retrait", "dab ", " atm ", "withdrawal"],
    category: "Retraits",
  },

  // ---- Virements internes / épargne ----
  {
    keywords: [
      "vir interne",
      "epargne",
      "livret a",
      "livret bleu",
      "ldds",
      "pel ",
      "cel ",
      "pea ",
    ],
    category: "Virements internes",
  },

  // ---- Paypal / Lydia / Wero — fallback "Autres dépenses" since payee is unknown ----
  {
    keywords: ["paypal", "lydia", "wero"],
    category: "Autres dépenses",
  },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function findMatchingCategoryId(
  description: string,
  rules: Rule[],
): string | null {
  const normalized = normalize(description);
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  for (const rule of sorted) {
    const pattern = normalize(rule.pattern);
    if (pattern.length > 0 && normalized.includes(pattern)) {
      return rule.category_id;
    }
  }
  return null;
}

/**
 * Build seed rules from DEFAULT_KEYWORD_RULES, mapping each keyword to its
 * category id. Categories are seeded by the DB trigger on signup.
 */
export function buildSeedRules(
  categoryIdByName: Map<string, string>,
): { pattern: string; category_id: string; priority: number }[] {
  const rules: { pattern: string; category_id: string; priority: number }[] = [];
  let priority = 100;
  for (const { keywords, category } of DEFAULT_KEYWORD_RULES) {
    const catId = categoryIdByName.get(category);
    if (!catId) continue;
    for (const kw of keywords) {
      rules.push({ pattern: kw.trim(), category_id: catId, priority });
      priority++;
    }
  }
  return rules;
}
