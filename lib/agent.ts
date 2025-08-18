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
  return `You are ${sc.persona} who owns/manages ${sc.bar_name || 'this venue'}.

CONTEXT: ${sc.intro || 'You run a bar and the BA wants to discuss Jägermeister.'}

YOUR MAIN CONCERN: ${sc.primary_objection}
OTHER WORRIES: ${sc.secondary_objection_pool?.join(', ') || 'None specific'}

YOUR PERSONALITY (${difficulty} mode):
${difficulty === 'easy' ? 
`• You're open-minded and friendly
• You like trying new things if they make sense
• You appreciate when people offer help
• Quick to agree if the idea is reasonable` : ''}
${difficulty === 'medium' ? 
`• You're cautious but fair
• You need good reasons to change things
• You ask practical questions
• You'll agree if concerns are properly addressed` : ''}
${difficulty === 'hard' ? 
`• You're skeptical of sales pitches
• You need proof and data, not promises
• You've heard it all before
• Only solid guarantees will convince you` : ''}

HOW TO RESPOND:
1. If BA asks you a question → Answer it honestly
2. If BA makes a pitch → Express your actual concerns
3. If BA addresses your worries → Acknowledge it
4. Keep responses short (1-3 sentences)
5. Be a real person, not a robot

ENDING THE CONVERSATION:
• If your main concerns are addressed → Agree to try it
• If the conversation drags on (8+ turns) → Make a decision
• If BA gives you good solutions → Don't be stubborn

Remember: You're having a real conversation. React naturally to what the BA says.`;
}

function userToAgent(sc: any, state: TrainerState, lastTurn: string, difficulty: string = 'medium', conversationHistory?: string[]) {
  // Check what type of message BA sent
  const lastTurnLower = lastTurn.toLowerCase();
  const isQuestion = lastTurn.includes('?') || 
                    lastTurnLower.includes('tell me') ||
                    lastTurnLower.includes('what') ||
                    lastTurnLower.includes('how') ||
                    lastTurnLower.includes('when') ||
                    lastTurnLower.includes('who');
  
  // Track what BA has offered/addressed
  const hasOfferedSolution = lastTurnLower.includes('free') || 
                             lastTurnLower.includes('trial') ||
                             lastTurnLower.includes('training') ||
                             lastTurnLower.includes('we provide') ||
                             lastTurnLower.includes('we offer') ||
                             lastTurnLower.includes('guarantee');
  
  // Simple decision logic
  const shouldConsiderAgreeing = state.turn > 6 || // Long conversation
                                 (difficulty === 'easy' && state.turn > 3 && hasOfferedSolution) ||
                                 (difficulty === 'medium' && state.turn > 4 && hasOfferedSolution) ||
                                 (difficulty === 'hard' && state.turn > 6 && hasOfferedSolution);

  return `BA just said: "${lastTurn}"

CONTEXT:
• This is turn ${state.turn} of the conversation
• You've raised these concerns: ${state.objectionsRaised.join(', ') || 'none yet'}
• BA ${isQuestion ? 'is asking you a question' : 'is making a pitch'}

YOUR RESPONSE:
${isQuestion ? 
'Answer their question naturally. Share real information about your venue, customers, or situation.' :
'React to their pitch. If it addresses your concerns, acknowledge it. If not, explain what worries you.'}

${shouldConsiderAgreeing ? 
`⚠️ The conversation has gone on long enough. Time to make a decision:
- If BA has addressed your main concerns → Agree to try it
- If still not convinced → Politely decline` : 
'Continue the conversation naturally.'}

Remember: Keep it short (1-3 sentences) and conversational.`;
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