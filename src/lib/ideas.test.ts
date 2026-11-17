import { describe, it, expect } from 'vitest';
import { INITIAL_FORM_DATA } from '@/types/prompt';
import { AssistantRequestError } from './assistant-client';
import {
  IDEA_REFERENCE_PREFIX, ideaReference, ideaTitleFromReference, formDataFromIdea,
  canAskForIdeas, briefKey, isStaleAnswer, ideasErrorMessage,
} from './ideas';

const FIELDS = {
  format_layout: 'Wide banner, hero right.',
  primary_object: 'A golden countdown clock.',
  subject: 'A hero in white-and-gold armour.',
  lighting: 'Golden hour.',
  mood: 'Victorious.',
  background: 'Sunlit clouds.',
  positive_prompt: 'Cinematic hero beside a golden countdown clock…',
  negative_prompt: 'no text, no logos',
};

describe('idea reference marker', () => {
  it('round-trips the idea title', () => {
    expect(IDEA_REFERENCE_PREFIX).toBe('idea:');
    expect(ideaReference('Golden Countdown')).toBe('idea:Golden Countdown');
    expect(ideaTitleFromReference(ideaReference('Golden Countdown'))).toBe('Golden Countdown');
  });

  it('is not fooled by a saved reference or an empty value', () => {
    expect(ideaTitleFromReference('Stormcraft Arrival — A hero…')).toBeNull();
    expect(ideaTitleFromReference('')).toBeNull();
    expect(ideaTitleFromReference(undefined)).toBeNull();
    expect(ideaTitleFromReference('idea:')).toBeNull();
  });
});

describe('formDataFromIdea', () => {
  it("keeps the form's settings and takes the idea's eight prompt parts", () => {
    const current = { ...INITIAL_FORM_DATA, brand: 'RocketSpin', aspectRatio: '1:1', subjectPosition: 'Left', theme: 'NY', description: 'fireworks', subject: 'old subject' };
    const f = formDataFromIdea(current, 'Sky Courier', FIELDS);
    expect(f).toMatchObject({
      brand: 'RocketSpin', aspectRatio: '1:1', subjectPosition: 'Left', theme: 'NY', description: 'fireworks',
      reference: 'idea:Sky Courier', ...FIELDS,
    });
    expect(current.subject).toBe('old subject'); // the current form isn't changed in place
  });
});

describe('canAskForIdeas', () => {
  it('needs a brand and a brief that is not just spaces', () => {
    expect(canAskForIdeas('RocketSpin', 'new year')).toBe(true);
    expect(canAskForIdeas('RocketSpin', '   ')).toBe(false);
    expect(canAskForIdeas('', 'new year')).toBe(false);
  });
});

describe('stale answers', () => {
  it('drops an answer asked for another brand or brief', () => {
    expect(briefKey('RocketSpin', ' new year ')).toBe(briefKey('RocketSpin', 'new year'));
    expect(isStaleAnswer(briefKey('SpinJo', 'x'), briefKey('RocketSpin', 'x'))).toBe(true);
    expect(isStaleAnswer(briefKey('RocketSpin', 'x'), briefKey('RocketSpin', 'y'))).toBe(true);
    expect(isStaleAnswer(briefKey('RocketSpin', 'x'), briefKey('RocketSpin', 'x'))).toBe(false);
  });
});

describe('ideasErrorMessage', () => {
  it('says plainly when the daily budget is used up or the sign-in expired', () => {
    expect(ideasErrorMessage(new AssistantRequestError('m', 429))).toBe("You've reached today's ideas budget — try again tomorrow");
    expect(ideasErrorMessage(new AssistantRequestError('m', 401))).toBe('Your sign-in has expired — sign in again to get ideas');
  });

  it('falls back to a short retry message for anything else', () => {
    expect(ideasErrorMessage(new AssistantRequestError('m', 500))).toBe("Couldn't get ideas — try again");
    expect(ideasErrorMessage(new Error('boom'))).toBe("Couldn't get ideas — try again");
    expect(ideasErrorMessage('weird')).toBe("Couldn't get ideas — try again");
  });
});
