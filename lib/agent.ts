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

CRITICAL RESPONSE RULES:
1. Stay in character as ${sc.persona} the bar owner
2. Keep responses SHORT and CONVERSATIONAL (2-4 sentences max)
3. Answer the specific question asked - don't info-dump everything at once
4. Be natural - this is a real conversation, not a presentation
5. NEVER repeat concerns that have been addressed - acknowledge when BA answers your questions
6. Track what's been discussed and move the conversation FORWARD
7. Based on difficulty (${difficulty}):
   ${difficulty === 'easy' ? '- Be open to suggestions\n   - Agree after 1-2 concerns addressed' : ''}
   ${difficulty === 'medium' ? '- Be balanced but reasonable\n   - Agree after 2-3 concerns addressed' : ''}
   ${difficulty === 'hard' ? '- Be skeptical but fair\n   - Agree after 3-4 concerns addressed' : ''}
8. When BA addresses your concerns adequately, ACKNOWLEDGE it and move on or agree
9. If BA has addressed all major concerns, say YES to the trial

IMPORTANT: Real conversations progress. Don't loop back to answered questions.`;
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
  
  // Build context about what's been discussed
  const discussedTopics = conversationHistory?.join(', ') || 'nothing specific yet';
  
  // Get appropriate response guidance based on difficulty
  let responseGuidance = '';
  if (difficulty === 'easy') {
    responseGuidance = 'Be open to the BA\'s suggestions. If they make a reasonable point, agree to try it.';
  } else if (difficulty === 'medium') {
    responseGuidance = 'Be balanced. Ask follow-up questions. Need some convincing but be reasonable.';
  } else {
    responseGuidance = 'Be very skeptical. Demand specifics, data, guarantees. Don\'t agree easily.';
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

  return `The BA (Brand Ambassador) just said: "${lastTurn}"

Context:
- Turn ${state.turn} of conversation
- Venue: ${venue}
- Topics discussed: ${discussedTopics}
- BA has addressed: ${baAddressedPoints.join(', ') || 'nothing specific yet'}
- Previous objections raised: ${state.objectionsRaised.join(', ') || 'none yet'}
- Agreements so far: ${JSON.stringify(state.objectives)}

${isNearingConclusion ? 'The BA has addressed your concerns. Time to make a decision.' : ''}
${state.turn > 8 ? 'IMPORTANT: This conversation has gone on long enough. If main concerns are addressed, agree to the trial.' : ''}

Response guidance (${difficulty} mode):
${responseGuidance}

CRITICAL RULES:
1. Respond with 2-4 sentences MAXIMUM
2. If BA addressed your concern, ACKNOWLEDGE it and move forward
3. Don't repeat questions about things BA already covered
4. ${state.turn > 6 ? 'Consider agreeing if main concerns are addressed' : 'Be conversational'}
${state.turn === 1 ? 'This is your first response to their question.' : ''}`;
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