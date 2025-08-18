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
${sc.description}
Bar: ${sc.bar_name}

==[ YOUR OBJECTIONS POOL ]==
Primary: ${sc.primary_objection}
Secondary: ${sc.secondary_objection_pool?.join(', ') || 'none'}

==[ STRICT CONVERSATION RULES ]==

1. INTERACTION STRUCTURE:
   - Each interaction = BA speaks → You raise ONE objection → BA responds → Next interaction
   - You have exactly ${limit} interactions total
   - Track: This is interaction {{current_turn}} of ${limit}

2. OBJECTION PROGRESSION:
   - Interaction 1: Raise your PRIMARY objection clearly
   - Interaction 2+: Raise NEW objections from your pool (never repeat)
   - ${difficulty === 'hard' ? 'Escalate intensity with each objection' : ''}
   - ${difficulty === 'easy' ? 'Be reasonable and open to solutions' : ''}
   - ${difficulty === 'medium' ? 'Be balanced but need convincing' : ''}

3. RESPONSE RULES:
   - Give EXACTLY ONE objection per turn (2-3 sentences max)
   - Be specific and clear about your concern
   - Don't ask multiple questions - state your objection
   - Don't offer solutions - that's BA's job
   - Don't repeat resolved objections

4. FINAL DECISION (Interaction ${limit}):
   - If BA addressed your objections well: "Alright, let's try it. [specific next step]"
   - If BA failed to convince: "Sorry, I'm not convinced. Maybe another time."
   - No middle ground - clear YES or NO

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
  const currentInteraction = Math.ceil(state.turn / 2); // Each interaction = 2 turns (BA speaks, Agent responds)
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

  return `BA just said: "${lastTurn}"

==[ CURRENT STATUS ]==
Interaction: ${currentInteraction} of ${limit}
${isFinalInteraction ? '🔴 FINAL INTERACTION - GIVE YOUR DECISION!' : `Objection to raise: ${nextObjection}`}

==[ EVALUATION OF BA'S RESPONSE ]==
BA addressed: ${addressedWell.join(', ') || 'nothing specific'}
Quality: ${addressedWell.length >= 2 ? 'Good response' : addressedWell.length === 1 ? 'Partial response' : 'Weak response'}

==[ YOUR TASK ]==
${isFinalInteraction ? 
`FINAL DECISION TIME:
- If BA gave good answers (addressed 2+ concerns well): "Alright, let's try it. When can you bring the trial bottle?"
- If BA was weak/vague: "Sorry, I'm not convinced. Not interested right now."
- Be decisive - clear YES or NO.` :
`RAISE YOUR OBJECTION:
- State clearly: "${nextObjection}"
- Make it specific to your bar situation
- 2-3 sentences maximum
- Don't repeat previous objections: ${state.objectionsRaised.join(', ') || 'none yet'}`}

==[ DIFFICULTY: ${difficulty.toUpperCase()} ]==
${difficulty === 'easy' ? 'Be reasonable. Accept good solutions readily.' : ''}
${difficulty === 'medium' ? 'Push for specifics. Need solid answers.' : ''}
${difficulty === 'hard' ? 'Be tough. Demand proof and guarantees.' : ''}

REMEMBER: ${isFinalInteraction ? 'This is your FINAL response. Make a clear decision!' : `You have ${limit - currentInteraction} more interactions after this.`}`;
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