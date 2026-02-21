export type MatchRequirements = {
  role: string;
  skills: string[];
  experience: string;
  keywords: string[];
};

export type ResumeForMatch = {
  id: string;
  file_name: string;
  extracted_text: string | null;
  status: string | null;
};

export type MatchBreakdown = {
  role: number;
  skills: number;
  experience: number;
  keywords: number;
};

export type ResumeMatchResult = {
  resumeId: string;
  fileName: string;
  score: number;
  confidence: "strong" | "moderate" | "low";
  matchedKeywords: string[];
  matchedSkills: string[];
  missingKeywords: string[];
  missingSkills: string[];
  roleMatched: boolean;
  experienceMatched: boolean;
  breakdown: MatchBreakdown;
};

const ROLE_WEIGHT = 0.25;
const SKILLS_WEIGHT = 0.35;
const EXPERIENCE_WEIGHT = 0.15;
const KEYWORDS_WEIGHT = 0.25;
const TOKEN_MIN_LENGTH = 2;
const SCORE_EPSILON = 0.0001;

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]+/g, " ").replace(/\s+/g, " ").trim();
}

function parseCsvLike(value: string): string[] {
  return value
    .split(/[,\n]+/)
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

function includesWholePhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escapedNeedle}\\b`, "i");
  return regex.test(haystack);
}

function ratio(matched: number, total: number): number {
  if (!total) return 0;
  return matched / total;
}

function toPercentScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= TOKEN_MIN_LENGTH);
}

function tokenizeToSet(value: string): Set<string> {
  return new Set(tokenize(value));
}

function hasTokenCoverage(textTokens: Set<string>, phrase: string): boolean {
  const tokens = tokenize(phrase);
  if (tokens.length === 0) return false;
  return tokens.every((token) => textTokens.has(token));
}

function findYears(value: string): number[] {
  const matches = normalizeText(value).matchAll(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/g);
  const years = Array.from(matches, (match) => Number.parseInt(match[1], 10)).filter(
    (year) => Number.isFinite(year)
  );
  return unique(years.map((year) => String(year))).map((year) => Number.parseInt(year, 10));
}

function scoreExperience(extractedText: string, requirement: string): { matched: boolean; score: number } {
  if (!requirement) return { matched: false, score: 0 };
  if (includesWholePhrase(extractedText, requirement)) return { matched: true, score: 1 };

  const requirementYears = findYears(requirement);
  const resumeYears = findYears(extractedText);
  if (requirementYears.length > 0 && resumeYears.length > 0) {
    const required = Math.max(...requirementYears);
    const available = Math.max(...resumeYears);
    const scored = Math.max(0, Math.min(1, available / required));
    return { matched: scored >= 1 - SCORE_EPSILON, score: scored };
  }

  return { matched: false, score: hasTokenCoverage(tokenizeToSet(extractedText), requirement) ? 0.75 : 0 };
}

function scoreRole(extractedText: string, requirement: string): { matched: boolean; score: number } {
  if (!requirement) return { matched: false, score: 0 };
  if (includesWholePhrase(extractedText, requirement)) return { matched: true, score: 1 };
  const tokenCoverage = hasTokenCoverage(tokenizeToSet(extractedText), requirement);
  return { matched: false, score: tokenCoverage ? 0.7 : 0 };
}

function scoreTerms(
  extractedText: string,
  normalizedTextTokens: Set<string>,
  requirements: string[]
): { matched: string[]; missing: string[]; score: number } {
  if (requirements.length === 0) {
    return { matched: [], missing: [], score: 0 };
  }

  const matched = requirements.filter(
    (term) => includesWholePhrase(extractedText, term) || hasTokenCoverage(normalizedTextTokens, term)
  );
  const missing = requirements.filter((term) => !matched.includes(term));
  return { matched, missing, score: ratio(matched.length, requirements.length) };
}

function getConfidence(score: number): "strong" | "moderate" | "low" {
  if (score >= 80) return "strong";
  if (score >= 55) return "moderate";
  return "low";
}

export function buildRequirements(input: {
  role: string;
  skills: string;
  experience: string;
  keywords: string;
}): MatchRequirements {
  const skills = unique(parseCsvLike(input.skills));
  const keywords = unique(parseCsvLike(input.keywords));
  return {
    role: normalizeText(input.role),
    skills,
    experience: normalizeText(input.experience),
    keywords,
  };
}

export function matchResumes(
  resumes: ResumeForMatch[],
  requirements: MatchRequirements
): ResumeMatchResult[] {
  return resumes
    .map((resume) => {
      const text = normalizeText(resume.extracted_text || "");
      const textTokens = tokenizeToSet(text);

      const roleScore = scoreRole(text, requirements.role);
      const skillScore = scoreTerms(text, textTokens, requirements.skills);
      const experienceScore = scoreExperience(text, requirements.experience);
      const keywordScore = scoreTerms(text, textTokens, requirements.keywords);

      const enabledWeights = [
        requirements.role ? ROLE_WEIGHT : 0,
        requirements.skills.length > 0 ? SKILLS_WEIGHT : 0,
        requirements.experience ? EXPERIENCE_WEIGHT : 0,
        requirements.keywords.length > 0 ? KEYWORDS_WEIGHT : 0,
      ];
      const weightTotal = enabledWeights.reduce((sum, weight) => sum + weight, 0);
      const normalizedWeight = (weight: number): number => (weightTotal > 0 ? weight / weightTotal : 0);

      const breakdown: MatchBreakdown = {
        role: roleScore.score,
        skills: skillScore.score,
        experience: experienceScore.score,
        keywords: keywordScore.score,
      };

      const weightedScore =
        breakdown.role * normalizedWeight(requirements.role ? ROLE_WEIGHT : 0) +
        breakdown.skills * normalizedWeight(requirements.skills.length > 0 ? SKILLS_WEIGHT : 0) +
        breakdown.experience * normalizedWeight(requirements.experience ? EXPERIENCE_WEIGHT : 0) +
        breakdown.keywords * normalizedWeight(requirements.keywords.length > 0 ? KEYWORDS_WEIGHT : 0);

      const score = toPercentScore(weightedScore);

      return {
        resumeId: resume.id,
        fileName: resume.file_name,
        score,
        confidence: getConfidence(score),
        matchedKeywords: keywordScore.matched,
        matchedSkills: skillScore.matched,
        missingKeywords: keywordScore.missing,
        missingSkills: skillScore.missing,
        roleMatched: roleScore.matched,
        experienceMatched: experienceScore.matched,
        breakdown,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.matchedSkills.length + b.matchedKeywords.length - (a.matchedSkills.length + a.matchedKeywords.length) ||
        a.fileName.localeCompare(b.fileName)
    );
}
