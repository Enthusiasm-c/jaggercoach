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
• If BA addresses your main concern AND asks "deal?" → Say YES
• Once you say "let's do it" or "deal" → YOU'RE COMMITTED, don't backtrack
• If BA keeps agreeing to your conditions → Stop asking for more
• After 8 turns → Make a final decision

IMPORTANT RULE: Once you agree (say "deal", "let's do it", etc.), the conversation is DONE.
Don't add new conditions or concerns after agreeing.

CLOSING PHRASES TO USE:
• "Great, let's do it. When can we start?"
• "Sounds good, we have a deal."
• "Perfect, I'm on board."

Remember: You're a business owner who WANTS to succeed. Once your concerns are addressed, close the deal and STICK TO IT.`;
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
  
  // Track what BA has agreed to IN THIS MESSAGE
  const agreedToInThisTurn = {
    noPOSM: lastTurnLower.includes('no posm') || lastTurnLower.includes('no poster') || 
            lastTurnLower.includes('no bulky') || lastTurnLower.includes('low-key'),
    training: lastTurnLower.includes('training') || lastTurnLower.includes('train') || 
              lastTurnLower.includes('brief'),
    freeProduct: lastTurnLower.includes('free product') || lastTurnLower.includes('free bottle'),
    trial: lastTurnLower.includes('trial') || lastTurnLower.includes('test'),
  };
  
  // Track cumulative agreements from conversation history
  const previousAgreements = (conversationHistory || []).join(' ').toLowerCase();
  const alreadyAgreedTo = {
    noPOSM: previousAgreements.includes('no posm') || previousAgreements.includes('no poster'),
    training: previousAgreements.includes('training_agreed') || previousAgreements.includes('staff_training'),
    freeProduct: previousAgreements.includes('free_trial') || previousAgreements.includes('free_product'),
  };
  
  // Check if agent already closed the deal in a previous turn
  const alreadyClosedDeal = previousAgreements.includes('deal_closed') || 
                           previousAgreements.includes('agent_agreed');
  
  // Check if BA is asking for closure
  const baWantsToClose = lastTurnLower.includes('deal?') || 
                         lastTurnLower.includes('so deal') ||
                         lastTurnLower.includes('let\'s do') ||
                         lastTurnLower.includes('ok?') ||
                         lastTurnLower.includes('agreed?');
  
  // Determine if main concerns are addressed
  const mainConcernsAddressed = 
    (sc.id === 'no_promo' && (agreedToInThisTurn.noPOSM || alreadyAgreedTo.noPOSM)) ||
    (sc.id === 'product_absent' && (agreedToInThisTurn.trial || alreadyAgreedTo.freeProduct)) ||
    (sc.id === 'no_perfect_serve' && (agreedToInThisTurn.training || alreadyAgreedTo.training));
  
  // Decision logic
  const shouldCloseDeal = baWantsToClose && mainConcernsAddressed;
  const shouldStopRepeating = state.turn > 8 || (baWantsToClose && state.turn > 4);

  return `BA just said: "${lastTurn}"

CONTEXT:
• Turn ${state.turn} of conversation
• Scenario: ${sc.title || 'Bar discussion'}
${alreadyAgreedTo.noPOSM ? '• ✅ BA already agreed: No POSM' : ''}
${alreadyAgreedTo.training ? '• ✅ BA already agreed: Training provided' : ''}
${alreadyAgreedTo.freeProduct ? '• ✅ BA already agreed: Free product/trial' : ''}

CRITICAL DECISION RULES:
${alreadyClosedDeal ?
'✅ YOU ALREADY AGREED! Just confirm next steps like timing or logistics.' :
shouldCloseDeal ? 
'🟢 CLOSE THE DEAL NOW! BA addressed your concerns and wants to close. Say: "Great, let\'s do it. When can we start?"' :
baWantsToClose ? 
'🟡 BA wants to close. If they addressed your MAIN concern, agree. Otherwise, state ONE remaining concern clearly.' :
shouldStopRepeating ?
'🔴 Conversation too long. Make a decision: agree or politely decline.' :
'Continue naturally but don\'t repeat concerns already addressed.'}

YOUR RESPONSE:
${isQuestion && !baWantsToClose ? 
'Answer their question about your venue/situation.' :
shouldCloseDeal ?
'AGREE TO THE DEAL. Be positive and ask about next steps.' :
'React to their offer. If it addresses your concern, acknowledge it.'}

IMPORTANT: Don't ask for confirmations about things BA already agreed to.`;
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