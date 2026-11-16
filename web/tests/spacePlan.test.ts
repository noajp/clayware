import { describe, expect, it } from 'vitest';
import { canAddDomain, isDomainLimitError, planHasAthena, planOf, PLAN_TERMS } from '@/Function/space/spacePlan';

describe('space plans', () => {
  it('reads an unknown value as free, the plan that allows least', () => {
    expect(planOf('team')).toBe('team');
    expect(planOf('enterprise')).toBe('enterprise');
    expect(planOf('gold')).toBe('free');
    expect(planOf(null)).toBe('free');
  });

  it('lets a free Space hold two Domains and no more', () => {
    expect(canAddDomain('free', 0)).toBe(true);
    expect(canAddDomain('free', 1)).toBe(true);
    expect(canAddDomain('free', 2)).toBe(false);
    expect(canAddDomain('team', 50)).toBe(true);
    expect(canAddDomain('enterprise', 500)).toBe(true);
  });

  it('gives Athena to team and enterprise only', () => {
    expect(planHasAthena('free')).toBe(false);
    expect(planHasAthena('team')).toBe(true);
    expect(planHasAthena('enterprise')).toBe(true);
  });

  it('prices team per member and enterprise by contract', () => {
    expect(PLAN_TERMS.team.yenPerMember).toBe(500);
    expect(PLAN_TERMS.enterprise.yenPerMember).toBeNull();
  });

  it('recognises the server’s Domain-limit refusal', () => {
    expect(isDomainLimitError({ hint: 'plan_domain_limit', message: 'x' })).toBe(true);
    expect(isDomainLimitError({ message: 'The Free plan holds up to 2 Domains. Move the Space to Team to add more.' })).toBe(true);
    expect(isDomainLimitError(new Error('network'))).toBe(false);
    expect(isDomainLimitError(null)).toBe(false);
  });
});
