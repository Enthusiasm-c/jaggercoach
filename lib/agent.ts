import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { TrainerState } from '@/lib/trainer-state';

// Load scenarios
const scenariosPath = path.join(process.cwd(), 'scenarios', 'jaeger_high5.yaml');
const scenariosContent = fs.readFileSync(scenariosPath, 'utf8');
const scenariosData = yaml.load(scenariosContent) as any;

function getScenario(scenarioId: string) {
  return scenariosData.scenarios.find((s: any) => s.id === scenarioId);
}

function agentSystem(sc: any, difficulty: string) {
  const difficultySettings = {
    easy: {
      skepticism: 'low',
      objections: '1-2 mild objections',
      agreement: 'agrees after 1-2 good arguments'
    },
    medium: {
      skepticism: 'moderate',
      objections: '2-3 realistic objections',
      agreement: 'needs 2-3 solid points'
    },
    hard: {
      skepticism: 'high',
      objections: '3-4 strong objections',
      agreement: 'requires data, guarantees, and persistence'
    }
  };

  const settings = difficultySettings[difficulty as keyof typeof difficultySettings] || difficultySettings.medium;

  return `You are ${sc.persona}, the owner/manager of "${sc.bar_name}".

DIFFICULTY: ${difficulty.toUpperCase()}
- Skepticism level: ${settings.skepticism}
- Will raise: ${settings.objections}
- Agreement pattern: ${settings.agreement}

Your personality and situation:
${sc.description}

Bar details:
- Name: ${sc.bar_name}
- Context: ${sc.context || 'Local bar'}

Current situation regarding Jägermeister:
- Primary concern: ${sc.primary_objection}
- Other potential concerns: ${sc.secondary_objection_pool?.join(', ') || 'none'}

CONVERSATION MEMORY - Track what's been discussed:
- When BA agrees to something (like "one bottle" or "custom design"), that concern is RESOLVED
- Don't bring up resolved concerns again
- Each turn should address NEW topics or move toward agreement
- If 2+ concerns are resolved, it's time to agree to the trial

CRITICAL RESPONSE RULES:
1. Stay in character as ${sc.persona} the bar owner
2. Keep responses SHORT and CONVERSATIONAL (2-4 sentences max)
3. ANSWER what the BA asked - don't ask multiple new questions
4. If BA asks a question, ANSWER IT directly first
5. You can express ONE concern if relevant, but don't interrogate the BA
6. NEVER EVER repeat concerns that have been addressed or agreed to
7. If BA says "one bottle" - DON'T ask about trial size again
8. If BA says "custom/minimal" - DON'T ask about POSM again
9. Progress the conversation - acknowledge agreements and move forward
10. Based on difficulty (${difficulty}):
   ${difficulty === 'easy' ? '- Be open and positive\n   - Agree after 1-2 concerns addressed' : ''}
   ${difficulty === 'medium' ? '- Be thoughtful but fair\n   - Express concerns naturally\n   - Agree after 2-3 concerns addressed' : ''}
   ${difficulty === 'hard' ? '- Be skeptical but listen\n   - Need convincing data\n   - Agree after 3-4 concerns addressed' : ''}
11. When BA addresses your concerns, ACKNOWLEDGE and move forward
12. If 2+ major concerns are addressed, AGREE to the trial

IMPORTANT: The BA is leading this conversation. React to them, don't lead.
IMPORTANT: Track what's been agreed. Don't loop back to settled issues.`;
}

function userToAgent(sc: any, state: TrainerState, lastTurn: string, difficulty: string = 'medium', conversationHistory?: string[]) {
  // Check if we've already agreed based on objectives
  function checkIfAgreed(state: TrainerState): boolean {
    return !!(state.objectives.trialOrder || state.objectives.promoAgreed || 
           state.objectives.staffTraining || state.objectives.tapMachine);
  }
  
  // Get venue-specific details
  const venueInfo = {
    'product_absent': 'Minimalist cocktail bar with digital menu, no chalkboard, subtle table cards for promos',
    'no_promo': 'Traditional pub, existing promotional materials, comfortable with current setup',
    'no_perfect_serve': 'Beach club with tap machine present but not used, casual atmosphere'
  };
  
  const venue = venueInfo[state.scenarioId as keyof typeof venueInfo] || '';
  
  // Determine current conversation state
  const hasAgreedToSomething = checkIfAgreed(state);
  const isNearingConclusion = state.turn > 5 && hasAgreedToSomething;
  
  // Build context about what's been discussed and agreed
  const discussedTopics = conversationHistory?.join(', ') || 'nothing specific yet';
  const hasAgreedToTrialSize = conversationHistory?.includes('trial_size_agreed');
  const hasAgreedToPOSM = conversationHistory?.includes('posm_agreed');
  const hasAgreedToReturn = conversationHistory?.includes('return_policy_agreed');
  const hasAgreedToFree = conversationHistory?.includes('free_trial_agreed');
  
  // Get appropriate response guidance based on difficulty
  let responseGuidance = '';
  if (difficulty === 'easy') {
    responseGuidance = 'Answer their question positively. Show openness to trying their solution.';
  } else if (difficulty === 'medium') {
    responseGuidance = 'Answer their question honestly. Express your actual concern but be reasonable.';
  } else {
    responseGuidance = 'Answer their question skeptically. Need concrete data and guarantees to be convinced.';
  }

  // Track what BA has addressed
  const baAddressedPoints = [];
  const lastTurnLower = lastTurn.toLowerCase();
  
  if (lastTurnLower.includes('free') || lastTurnLower.includes('no cost')) {
    baAddressedPoints.push('cost/pricing concerns');
  }
  if (lastTurnLower.includes('training') || lastTurnLower.includes('session')) {
    baAddressedPoints.push('staff training');
  }
  if (lastTurnLower.includes('take back') || lastTurnLower.includes('return')) {
    baAddressedPoints.push('return policy');
  }
  if (lastTurnLower.includes('no minimum') || lastTurnLower.includes('one bottle')) {
    baAddressedPoints.push('minimum commitment');
  }
  if (lastTurnLower.includes('custom') || lastTurnLower.includes('your team')) {
    baAddressedPoints.push('customization for venue');
  }

  // Detect if BA is asking a question
  const isBAAsking = lastTurn.includes('?') || 
                     lastTurnLower.includes('what') || 
                     lastTurnLower.includes('how') || 
                     lastTurnLower.includes('when') ||
                     lastTurnLower.includes('who') ||
                     lastTurnLower.includes('which') ||
                     lastTurnLower.includes('tell me');

  // Build list of already addressed items
  const alreadyAddressed = [];
  if (hasAgreedToTrialSize) alreadyAddressed.push('Trial size (one bottle agreed)');
  if (hasAgreedToPOSM) alreadyAddressed.push('POSM/materials (minimal/custom agreed)');
  if (hasAgreedToReturn) alreadyAddressed.push('Return policy (agreed)');
  if (hasAgreedToFree) alreadyAddressed.push('Pricing (free trial agreed)');

  return `The BA (Brand Ambassador) just said: "${lastTurn}"

Context:
- Turn ${state.turn} of conversation
- Venue: ${venue}
- Topics discussed: ${discussedTopics}
- BA has addressed: ${baAddressedPoints.join(', ') || 'nothing specific yet'}
- Previous objections raised: ${state.objectionsRaised.join(', ') || 'none yet'}
- Agreements so far: ${JSON.stringify(state.objectives)}
${alreadyAddressed.length > 0 ? `- ✅ ALREADY AGREED TO: ${alreadyAddressed.join(', ')}` : ''}

${isBAAsking ? '⚠️ The BA asked you a question - ANSWER IT DIRECTLY!' : ''}
${hasAgreedToTrialSize && hasAgreedToPOSM ? '⚠️ Main concerns addressed - time to close the deal!' : ''}
${isNearingConclusion ? 'The BA has addressed your concerns. Time to make a decision.' : ''}
${state.turn > 8 ? 'IMPORTANT: This conversation has gone on long enough. If main concerns are addressed, agree to the trial.' : ''}

Response guidance (${difficulty} mode):
${responseGuidance}

CRITICAL RULES:
1. Respond with 2-4 sentences MAXIMUM
2. ${isBAAsking ? 'ANSWER THE QUESTION FIRST before anything else' : 'React to what BA said'}
3. NEVER repeat concerns about: ${alreadyAddressed.join(', ') || 'nothing yet'}
4. ${alreadyAddressed.length >= 2 ? '✅ 2+ CONCERNS RESOLVED - AGREE TO THE TRIAL NOW!' : 'Mention ONE new concern at most'}
5. ${state.turn > 6 ? 'Time to close - agree if concerns are addressed' : 'Be conversational'}
${state.turn === 1 ? 'This is your first response. React naturally.' : ''}
${alreadyAddressed.length >= 2 ? '\n⚠️ IMPORTANT: You have 2+ resolved concerns. Time to say YES!' : ''}`;
}

// Export the main logic as a reusable function
export async function getAgentResponse(
  scenarioId: string, 
  state: TrainerState, 
  lastTurn: string, 
  difficulty: string = 'medium', 
  conversationHistory: string[] = []
) {
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    throw new Error('Scenario not found');
  }

  const { text } = await generateText({
    model: openai('gpt-5-mini'), // Latest mini model
    system: agentSystem(scenario, difficulty),
    prompt: userToAgent(scenario, state, lastTurn, difficulty, conversationHistory),
    temperature: 0.5, // Lower temperature for more focused, concise responses
  });
  
  // Determine which objection was raised
  let suggestedObjectionId = null;
  if (state.objectionsRaised.length === 0) {
    suggestedObjectionId = 'primary';
  } else if (state.objectionsRaised.length === 1) {
    suggestedObjectionId = scenario.secondary_objection_pool?.[0] || null;
  }
  
  return { reply: text, suggestedObjectionId };
}