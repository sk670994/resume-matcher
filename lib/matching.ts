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
  matchedKeywords: string[];
  matchedSkills: string[];
  roleMatched: boolean;
  experienceMatched: boolean;
  breakdown: MatchBreakdown;
};

const ROLE_WEIGHT = 0.25;
const SKILLS_WEIGHT = 0.35;
const EXPERIENCE_WEIGHT = 0.15;
const KEYWORDS_WEIGHT = 0.25;

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
  return haystack.includes(needle);
}

function ratio(matched: number, total: number): number {
  if (!total) return 0;
  return matched / total;
}

function toPercentScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function buildRequirements(input: {
  role: string;
  skills: string;
  experience: string;
  keywords: string;
}): MatchRequirements {
  return {
    role: normalizeText(input.role),
    skills: parseCsvLike(input.skills),
    experience: normalizeText(input.experience),
    keywords: parseCsvLike(input.keywords),
  };
}

export function matchResumes(
  resumes: ResumeForMatch[],
  requirements: MatchRequirements
): ResumeMatchResult[] {
  return resumes
    .map((resume) => {
      const text = normalizeText(resume.extracted_text || "");

      const roleMatched = requirements.role ? includesWholePhrase(text, requirements.role) : false;
      const matchedSkills = requirements.skills.filter((skill) => includesWholePhrase(text, skill));
      const experienceMatched = requirements.experience
        ? includesWholePhrase(text, requirements.experience)
        : false;
      const matchedKeywords = requirements.keywords.filter((keyword) =>
        includesWholePhrase(text, keyword)
      );

      const breakdown: MatchBreakdown = {
        role: requirements.role ? (roleMatched ? 1 : 0) : 0,
        skills: ratio(matchedSkills.length, requirements.skills.length),
        experience: requirements.experience ? (experienceMatched ? 1 : 0) : 0,
        keywords: ratio(matchedKeywords.length, requirements.keywords.length),
      };

      const weightedScore =
        breakdown.role * ROLE_WEIGHT +
        breakdown.skills * SKILLS_WEIGHT +
        breakdown.experience * EXPERIENCE_WEIGHT +
        breakdown.keywords * KEYWORDS_WEIGHT;

      return {
        resumeId: resume.id,
        fileName: resume.file_name,
        score: toPercentScore(weightedScore),
        matchedKeywords,
        matchedSkills,
        roleMatched,
        experienceMatched,
        breakdown,
      };
    })
    .sort((a, b) => b.score - a.score || a.fileName.localeCompare(b.fileName));
}
