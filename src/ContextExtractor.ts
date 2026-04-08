import { PIIType } from './types.js';
import type { PIIEntity, PIIContext } from './types.js';

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
]);

const TITLE_PATTERN = /\b(Dr|Mr|Mrs|Ms|Miss|Prof|Professor|Rev|Sir|Dame)\.?\s*$/i;
const GENDER_MALE_PATTERN = /\b(he|him|his|mr\.?|father|son|brother|husband)\b/i;
const GENDER_FEMALE_PATTERN = /\b(she|her|hers|mrs\.?|ms\.?|mother|daughter|sister|wife)\b/i;
const AGE_PATTERN = /\b(\d{1,3})\s*(?:M|F|yo|years?\s*old|y\/o)\b/i;
const ROLE_PATTERNS: Array<{ pattern: RegExp; role: string }> = [
  { pattern: /\bpatient\b/i, role: 'patient' },
  { pattern: /\bphysician|doctor\b/i, role: 'physician' },
  { pattern: /\bemployee\b/i, role: 'employee' },
  { pattern: /\bsender\b/i, role: 'sender' },
  { pattern: /\breferred\s+by\b/i, role: 'referrer' },
  { pattern: /\bmanager\b/i, role: 'manager' },
  { pattern: /\bclient\b/i, role: 'client' },
];

export class ContextExtractor {
  private windowSize: number;

  constructor(contextWindowSize: number = 50) {
    this.windowSize = contextWindowSize;
  }

  /** Extract context for a single entity from surrounding text */
  extractContext(entity: PIIEntity, fullText: string): PIIContext {
    const context: PIIContext = {};
    const windowStart = Math.max(0, entity.startIndex - this.windowSize);
    const windowEnd = Math.min(fullText.length, entity.endIndex + this.windowSize);
    const surrounding = fullText.slice(windowStart, windowEnd);
    const before = fullText.slice(windowStart, entity.startIndex);

    // Title detection (e.g., "Dr." before a name)
    if (entity.type === PIIType.NAME) {
      const titleMatch = before.match(TITLE_PATTERN);
      if (titleMatch) {
        context.title = titleMatch[1];
      }
    }

    // Gender hint from surrounding pronouns
    if (entity.type === PIIType.NAME) {
      if (GENDER_MALE_PATTERN.test(surrounding)) {
        context.genderHint = 'male';
      } else if (GENDER_FEMALE_PATTERN.test(surrounding)) {
        context.genderHint = 'female';
      } else {
        context.genderHint = 'neutral';
      }
    }

    // Age context
    const ageMatch = surrounding.match(AGE_PATTERN);
    if (ageMatch) {
      context.ageContext = ageMatch[1];
    }

    // Role detection
    for (const { pattern, role } of ROLE_PATTERNS) {
      if (pattern.test(surrounding)) {
        context.role = role;
        break;
      }
    }

    // Email subtype (corporate vs personal)
    if (entity.type === PIIType.EMAIL) {
      const domainMatch = entity.value.match(/@([^@]+)$/);
      if (domainMatch) {
        const domain = domainMatch[1].toLowerCase();
        context.domain = domain;
        context.subtype = PERSONAL_DOMAINS.has(domain) ? 'personal' : 'corporate';
      }
    }

    // Phone format detection
    if (entity.type === PIIType.PHONE) {
      if (entity.value.startsWith('+44')) {
        context.format = 'UK';
      } else if (entity.value.startsWith('+1') || /^\(?\d{3}\)?[-.\s]?\d{3}/.test(entity.value)) {
        context.format = 'US';
      } else if (entity.value.startsWith('+')) {
        context.format = 'international';
      } else {
        context.format = 'US';
      }
    }

    return context;
  }

  /** Build relationships between entities in the same text */
  buildRelationships(entities: PIIEntity[], fullText: string): void {
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];

      // Link emails to nearby names (possessive or proximity)
      if (entity.type === PIIType.EMAIL) {
        const emailLocalPart = entity.value.split('@')[0].toLowerCase().replace(/[._-]/g, ' ');

        for (let j = 0; j < entities.length; j++) {
          if (i === j) continue;
          if (entities[j].type !== PIIType.NAME) continue;

          const nameParts = entities[j].value.toLowerCase().split(/\s+/);
          const nameMatchesEmail = nameParts.some(part =>
            emailLocalPart.includes(part) && part.length > 2
          );

          if (nameMatchesEmail) {
            entity.context.relatedEntities = entity.context.relatedEntities || [];
            entity.context.relatedEntities.push(j);
            entity.context.relationship = 'belongs_to';
          }
        }
      }

      // Link phone numbers to nearby names (proximity-based)
      if (entity.type === PIIType.PHONE) {
        for (let j = 0; j < entities.length; j++) {
          if (i === j) continue;
          if (entities[j].type !== PIIType.NAME) continue;

          const distance = Math.abs(entity.startIndex - entities[j].endIndex);
          if (distance < this.windowSize) {
            entity.context.relatedEntities = entity.context.relatedEntities || [];
            entity.context.relatedEntities.push(j);
            entity.context.relationship = 'belongs_to';
            break;
          }
        }
      }

      // Check for possessive pattern ("John's email", "Jane's phone")
      if (entity.type === PIIType.EMAIL || entity.type === PIIType.PHONE) {
        const before = fullText.slice(
          Math.max(0, entity.startIndex - 100),
          entity.startIndex
        );
        const possessiveMatch = before.match(/(\w+(?:\s+\w+)?)'s\s+(?:email|phone|number|cell|mobile)/i);
        if (possessiveMatch) {
          const possessorName = possessiveMatch[1];
          for (let j = 0; j < entities.length; j++) {
            if (entities[j].type === PIIType.NAME && entities[j].value.includes(possessorName)) {
              entity.context.relatedEntities = [j];
              entity.context.relationship = 'owns';
              break;
            }
          }
        }
      }
    }
  }
}
