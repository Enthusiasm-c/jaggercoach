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
  const interactionLimits = {
    easy: 2,
    medium: 3,
    hard: 4
  };

  const limit = interactionLimits[difficulty as keyof typeof interactionLimits] || 3;

  return `You are ${sc.persona}, the owner/manager of "${sc.bar_name}".

==[ FIXED INTERACTION RULES ]==
DIFFICULTY: ${difficulty.toUpperCase()}
TOTAL INTERACTIONS ALLOWED: ${limit}
Current interaction: [Will be provided in context] of ${limit}

==[ YOUR CHARACTER ]==
You are ${sc.persona}
Bar: ${sc.bar_name || 'Local venue'}

==[ YOUR OBJECTIONS POOL ]==
Primary: ${sc.primary_objection}
Secondary: ${sc.secondary_objection_pool?.join(', ') || 'none'}

==[ STRICT CONVERSATION RULES ]==

1. INTERACTION STRUCTURE:
   - Each interaction = BA speaks → You raise ONE objection → BA responds → Next interaction
   - You have exactly ${limit} interactions total
   - Track: This is interaction {{current_turn}} of ${limit}

2. OBJECTION PROGRESSION:
   - Interaction 1: State your PRIMARY objection simply
   - Interaction 2+: Raise NEW objections from your pool (never repeat)
   - Don't keep mentioning venue size or type - BA knows where they are
   - ${difficulty === 'hard' ? 'Be skeptical and need proof' : ''}
   - ${difficulty === 'easy' ? 'Be reasonable and open to solutions' : ''}
   - ${difficulty === 'medium' ? 'Be balanced but need convincing' : ''}

3. RESPONSE RULES:
   - Give EXACTLY ONE objection per turn (1-2 sentences ideal, 3 max)
   - Be direct and natural - don't over-explain
   - State your concern simply without elaborating
   - Don't offer solutions - that's BA's job
   - Don't repeat resolved objections
   - Focus on real business concerns (speed, staff, space, guests)

4. FINAL DECISION (Interaction ${limit}):
   - Give ONLY the decision, no objection before it
   - If convinced: "Alright, let's try it. When can you start?"
   - If not convinced: "Sorry, I'm not convinced. Maybe another time."
   - ONE RESPONSE ONLY - just the decision

5. DIFFICULTY BEHAVIORS:
${difficulty === 'easy' ? `   - Be open to reasonable solutions
   - Accept good answers readily
   - Don't nitpick details` : ''}
${difficulty === 'medium' ? `   - Need solid answers to concerns
   - Push back on vague promises
   - Require specifics but be fair` : ''}
${difficulty === 'hard' ? `   - Demand proof and guarantees
   - Challenge every claim
   - Need data, not promises` : ''}

IMPORTANT: At interaction ${limit}, you MUST give a final decision.
NEVER exceed ${limit} interactions. No exceptions.`;
}

function userToAgent(sc: any, state: TrainerState, lastTurn: string, difficulty: string = 'medium', conversationHistory?: string[]) {
  // Determine interaction limits
  const interactionLimits = {
    easy: 2,
    medium: 3,
    hard: 4
  };
  
  const limit = interactionLimits[difficulty as keyof typeof interactionLimits] || 3;
  // Turn 1, 3, 5, 7 = agent responds (odd turns)
  // Turn 2, 4, 6, 8 = BA speaks (even turns)
  // But we start at turn 1 after intro, so:
  // Turn 1 = interaction 1, Turn 2 = still interaction 1
  // Turn 3 = interaction 2, Turn 4 = still interaction 2
  // Turn 5 = interaction 3, Turn 6 = still interaction 3
  const currentInteraction = Math.ceil(state.turn / 2);
  const isFinalInteraction = currentInteraction >= limit;
  
  // Track what objections have been raised
  const objectionPool = [sc.primary_objection, ...(sc.secondary_objection_pool || [])];
  const nextObjectionIndex = state.objectionsRaised.length;
  const nextObjection = objectionPool[nextObjectionIndex] || objectionPool[0];
  
  // Track what BA has addressed in this response
  const lastTurnLower = lastTurn.toLowerCase();
  const addressedWell = [];
  
  if (lastTurnLower.includes('free') || lastTurnLower.includes('no cost') || lastTurnLower.includes('cover')) {
    addressedWell.push('cost concerns');
  }
  if (lastTurnLower.includes('data') || lastTurnLower.includes('%') || lastTurnLower.includes('increase')) {
    addressedWell.push('ROI/data');
  }
  if (lastTurnLower.includes('minimal') || lastTurnLower.includes('subtle') || lastTurnLower.includes('custom')) {
    addressedWell.push('POSM concerns');
  }
  if (lastTurnLower.includes('trial') || lastTurnLower.includes('test') || lastTurnLower.includes('one bottle')) {
    addressedWell.push('commitment concerns');
  }
  if (lastTurnLower.includes('training') || lastTurnLower.includes('show') || lastTurnLower.includes('teach')) {
    addressedWell.push('staff concerns');
  }

  // Debug logging
  console.log('Agent turn calculation:', {
    stateTurn: state.turn,
    currentInteraction,
    limit,
    isFinalInteraction
  });

  return `BA just said: "${lastTurn}"

==[ CURRENT STATUS ]==
Turn: ${state.turn}
Interaction: ${currentInteraction} of ${limit}
${isFinalInteraction ? '🔴 THIS IS YOUR FINAL RESPONSE - DECIDE NOW!' : `Next objection: ${nextObjection}`}

==[ YOUR SINGLE TASK ]==
${isFinalInteraction ? 
`GIVE YOUR FINAL DECISION (choose one):
- If convinced: "Alright, let's try it. When can you do the training?"
- If not convinced: "Sorry, I'm not convinced. Maybe another time."
ONLY ONE RESPONSE. NO OBJECTION + DECISION. JUST THE DECISION.` :
`RAISE THIS OBJECTION:
"${nextObjection}"
- Say it naturally in 1-2 sentences
- Don't add anything else
- Don't make a decision yet`}

${isFinalInteraction ? 'CRITICAL: Give ONLY your decision. Nothing else.' : 'CRITICAL: Give ONLY the objection. No decision yet.'}

Difficulty: ${difficulty.toUpperCase()}
${difficulty === 'easy' && isFinalInteraction ? 'You should probably agree if BA tried.' : ''}
${difficulty === 'medium' && isFinalInteraction ? 'Agree if BA addressed your main concerns.' : ''}
${difficulty === 'hard' && isFinalInteraction ? 'Only agree if BA gave solid proof and guarantees.' : ''}`;
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